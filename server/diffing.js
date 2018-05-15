const sharedb = require('sharedb')
const diff = require('diff');

// TODO: Remove parts with '' at the end

/**
 * Takes the ops and creates a series of snapshots of the code.
 *   A new snapshot starts when the time between two consecutive
 *   ops is > threshold.
 * Required: ops.length >= 1.
 */
function chunkOpsIntoDiffs(ops, threshold, baseline) {
  if (!threshold) {
    threshold = 10000;
  }
  // TODO: Very large threshold => no results

  let chunkedDiffs = [];

  /* Setup the baseline of the document */ 
  let firstOp = ops[0];

  // The baseline for the next diff
  let currentBaseline = {v:0};
  sharedb.ot.apply(currentBaseline, firstOp);
  // The doc to apply ops to
  let currentDoc = {v:0};
  sharedb.ot.apply(currentDoc, firstOp);

  let lastTs = firstOp.m.ts;

  // Create a diff for the first part, so that
  // we can track original code
  let baseDiff = diff.diffLines(baseline.trim(), currentBaseline.data.text.trim());
  baseDiff.forEach(function(part) {
    // Note: should only be one part
    part.original = true;
    part.snapshotNumber = 0;
  });

  chunkedDiffs.push(baseDiff);

  let snapshotNumber = 1;

  /* Apply each op, and calculate a diff if two 
     consecutive ops are far enough apart */
  for (let i = 1; i < ops.length; i++) {
    let op = ops[i];

    // Start a new chunk if necessary
    if (op.m.ts - lastTs > threshold) {
      let chunkedDiff = diff.diffLines(
        currentBaseline.data.text.trim(), currentDoc.data.text.trim());
      
      // Only push diffs with changes
      if (!(chunkedDiff.length == 1 && 
          !chunkedDiff[0].added &&
          !chunkedDiff[0].removed)) {
        chunkedDiff.forEach(function(part) {
          part.snapshotNumber = snapshotNumber;
        });
        snapshotNumber += 1;
        chunkedDiffs.push(chunkedDiff);
      }

      // Make a deep copy
      currentBaseline = JSON.parse(JSON.stringify(currentDoc));
      
    }

    // Apply the op
    let err = sharedb.ot.apply(currentDoc, op);
    if (err) {
      // TODO: Better error handling
      console.log("err when applying op:" + JSON.stringify(err));
      return;
    }
       
    lastTs = op.m.ts;
  }

  // Add the last diff
  let chunkedDiff = diff.diffLines(
    currentBaseline.data.text.trim(), currentDoc.data.text.trim());

  // Only push diffs with changes
  if (!(chunkedDiff.length == 1 &&
      !chunkedDiff[0].added &&
      !chunkedDiff[0].removed)) {
    chunkedDiff.forEach(function(part) {
      part.snapshotNumber = snapshotNumber;
    });
    chunkedDiffs.push(chunkedDiff);
  }

  return chunkedDiffs; 
}

/**
 * Flattens the given list of diffs into one diff,
 *   maintaining the adds and removes that happened
 *   in each diff.
 */
function flattenDiffs(diffs) {
  if (diffs.length == 0) {
    return diffs;
  }

  // This algorithm uses a two-list strategy.
  // As we merge one diff with all the previous diffs,
  //   we push parts that we've already processed
  //   onto processedParts and pull from {unprocessedParts}
  //   as we merge in the current diff.

  let processedParts = [];
  let unprocessedParts = [];

  // TODO: Other way to handle base case?
  diffs[0].forEach(function(part) {
    processedParts.push(part);
  });

  // Process the remaining diffs
  diffs.slice(1).forEach(function(diff) {
    // When starting a new diff, all the old diffs
    // become "to be processed", so we need to
    // shift all the elements
    unprocessedParts = processedParts;
    processedParts = [];

    // Process each part of this diff
    diff.forEach(function(part) {
      // Push any removed parts onto {processedParts},
      //   since future diffs will never have to deal
      //   with parts that were removed in the past
      let currentPart = unprocessedParts[0];
      while (currentPart && currentPart.removed) {
        let partToShift = unprocessedParts.shift();
        processedParts.push(partToShift);
        currentPart = unprocessedParts[0];
      }

      // Process the part
      if (part.added) {
        processedParts.push(part);
      } else  {
        // Removed parts and normal parts can be processed
        //   the same way
        processPart(processedParts, unprocessedParts, part);
      }

    });

  });
  // The final product is all the processed parts
  return processedParts;
}

// mutates arrays
// TODO: Spec
function processPart(processedParts, unprocessedParts, part) {
  // Processing a removed part and an normal part is the same
  //   because you may have to go through many toBeProcessed parts
  //   if the current part overlaps multiple parts.
  // The only difference is what the value of 'removed' and 'added'
  //   should be when you process the parts.

  let totalCharsSeen = 0;
  let maxChars = part.value.length;

  while (totalCharsSeen < maxChars) {

    let nextPart = unprocessedParts.shift();

    // Parts that are already removed don't count toward
    //   our characters seen, so just process them
    //   and move on
    if (nextPart.removed) {
      processedParts.push(nextPart);
      continue;
    }

    if (totalCharsSeen + nextPart.value.length <= maxChars) {
      // This entire part can be processed
      let nextPartProcessed = {
        'value': nextPart.value,
        'snapshotNumber': nextPart.snapshotNumber,
        'original': nextPart.original,
        'removed': part.removed,
        // If this part is being removed, then 'added' should become
        //   false but otherwise it should keep its original value
        'added': (part.removed) ? false : nextPart.added
      }
      nextPart.removed = part.removed;
      processedParts.push(nextPartProcessed); 
      totalCharsSeen += nextPart.value.length;

    } else {
      // This part only goes partly through {nextPart}
      let numCharsOverlap = maxChars - totalCharsSeen;
      let nextPartProcessed = {
        'value': nextPart.value.substring(0, numCharsOverlap),
        'snapshotNumber': nextPart.snapshotNumber,
        'original': nextPart.original,
        'removed': part.removed,
        'added': (part.removed) ? false : nextPart.added
      }
      let nextPartUnprocessed = {
        'value': nextPart.value.substring(numCharsOverlap),
        'snapshotNumber': nextPart.snapshotNumber,
        'original': nextPart.original,
        'removed': nextPart.removed,
        'added': nextPart.added
      }
      processedParts.push(nextPartProcessed);
      unprocessedParts.unshift(nextPartUnprocessed);

      break;
    }
  }
}

/**
 * If the op added/deleted text, Return the op's
 *   text, type (insert or delete), and index at which
 *   the operation started in the file.
 * Otherwise, return null.
 */
function getOpText(op) {
  let textOrCursors = op.op[0].p[0];
  if (textOrCursors == 'text') {
    // Get type
    let type;
    let text;
    if (op.op[0].sd) {
      type = 'delete';
      text = op.op[0].sd;
    } else if (op.op[0].si) {
      type = 'insert';
      text = op.op[0].si;
    }

    if (text) {
      return {
        'index': op.op[0].p[1],
        'type': type,
        'text': text.split('')
      }
    }    
  }

  return null;
}


exports.chunkOpsIntoDiffs = chunkOpsIntoDiffs;
exports.flattenDiffs = flattenDiffs;