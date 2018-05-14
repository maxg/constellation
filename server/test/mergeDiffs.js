const webjs = require('../web');
const mergeDiffs = webjs.mergeDiffs;

// Tests for bugs found when looking at real code
function testMergedDiffsRegression() {
  /* Regression #4: Crashing when you have an added part
     that goes at the very end of the merged diff
     and after a removed part

     Real example was https://10.18.6.121:4443/dashboard/ic04-code-review/5a846b48b7975135a69e2500/m/codereviewfix/2018-02-14T12:12:00?visual=1
  */

  diff_0 = [
    {"value": "hello ", "added": true},
    {"value": "there", "original": true},
    {"value": "something", "removed": true}
  ]

  diff_1 = [
    {"value": "hello the"},
    {"value": "re", "removed":true},
    {"value": "6.031", "added": true}
  ]

  console.log("expect:hello =added;the=original;re=removed;something=removed;6.031=added");
  console.log(mergeDiffs([diff_0, diff_1]));


  /* Regression #3: Not going through enough of the diff
       during a normal part  */
  diff_0 = [
    {"count":3,"value":"/**\n * A mutable set of characters.\n */\n"},
    {"count":1,"removed":true,"value":"public interface Set {\n"},
    {"count":1,"added":true,"value":"public interface Set<E> {\n"},
    {"count":4,"value":"    \n    //////\n    // creators:\n    \n"},
    {"count":1,"removed":true,"value":"    // TODO\n"},
    {"count":4,"added":true,"value":"\n    public Set<E> CharSet1() {\n        m\n    }\n"},
    {"count":1,"value":"    \n"},
    {"count":1,"added":true,"value":"    \n"},
    {"count":3,"value":"    //////\n    // observers:\n    \n"},
    {"count":1,"removed":true,"value":"    // TODO\n"},
    {"count":1,"added":true,"value":"    public int size();\n"},
    {"count":1,"value":"    \n"},
    {"count":4,"added":true,"value":"    public boolean contains(E e);\n    \n    \n    \n"},
    {"count":8,"value":"    //////\n    // producers:\n    \n    // TODO\n    \n    //////\n    // mutators:\n    \n"},
    {"count":1,"removed":true,"value":"    // TODO\n"},
    {"count":2,"added":true,"value":"    public void add(E e);\n    public void remove(E e);\n"},
    {"count":1,"value":"    \n"},
    {"count":6,"added":true,"value":"    \n     \n        \n    \n    \n    \n"},
    {"count":1,"value":"}"}
  ];

  diff_1 = [
    {"count":10,"value":"/**\n * A mutable set of characters.\n */\npublic interface Set<E> {\n    \n    //////\n    // creators:\n    \n\n    public Set<E> CharSet1() {\n"},
    {"count":1,"removed":true,"value":"        m\n"},
    {"count":1,"added":true,"value":"       \n"},
    {"count":30,"value":"    }\n    \n    \n    //////\n    // observers:\n    \n public int size();\n    \n    public boolean contains(E e);\n    \n    \n    \n    //////\n    // producers:\n    \n    // TODO\n    \n    //////\n    // mutators:\n    \n    public void add(E e);\n    public void remove(E e);\n    \n    \n     \n        \n    \n    \n    \n}"},
  ];

  console.log("expect:public Set<E> CharSet1() to be all together");
  console.log(mergeDiffs([diff_0, diff_1]));

  /* Regression #1, causing bugs #1 and #2 
    TODO: Only test case not passing right now
  */
    diff_0 = [
      {'value': '    // TODO\n    \n    //////\n'},
    ];

    diff_1 = [
      {'value': '    // TODO\n', 'removed': true},
      {'value': '\n    public Set<E> CharSet1() {\n        m\n    }\n', 'added': true},
      {'value': '    \n'},
      {'value': '    \n', 'added': true},
      {'value': '    //////\n'}
    ];

    diff_2 = [
      {'value': '\n    public Set<E> CharSet1() {\n'},
      {'value': '        m\n', 'removed': true},
      {'value': '       \n', 'added': true},
      {'value': '    }\n    \n    \n    //////\n'}
    ]

    /* Expect:
        // TODO\n---------------------removed
        \n--------------------------------added
        public Set<E> CharSet1() {\n--added
            m\n-----------------------removed
           \n-------------------------added
        }\n---------------------------added
        \n----------------------------same
        \n----------------------------added
        //////\n------------------------same 
    */  
    console.log('expect: see comments');
    console.log(mergeDiffs([diff_0, diff_1, diff_2]));

    /** Simplified version of ^ */
    diff_0 = [
      {'value': 'agc'},
    ];

    diff_1 = [
      {'value': 'a', 'removed': true},
      {'value': 'bde', 'added': true},
      {'value': 'g'},
      {'value': 'h', 'added': true},
      {'value': 'c'}
    ];

    diff_2 = [
      {'value': 'b'},
      {'value': 'd', 'removed': true},
      {'value': 'f', 'added': true},
      {'value': 'eghc'}
    ]

    console.log("a=removed;b=added;d:removed;f:added;e:added;g=original;h:added;c:original");
    console.log(mergeDiffs([diff_0, diff_1, diff_2]));

    /* Bug #2 minimized */
    diff_0 = [
      {'value': 'something'}
    ];

    diff_1 = [
      {'value': 'some'},
      {'value': 'muchlongthing', 'added': true},
      {'value': 'th'},
      {'value': 'short', 'added': true},
      {'value': 'ing'}
    ];
    console.log('expect:some=same,muchlongthing=added,th=same,short=added,ing=same');
    console.log(mergeDiffs([diff_0, diff_1]));

    /* Bug #1 minimized */
    diff_0 = [
      {'value': 'something'}
    ];

    diff_1 = [
      {'value': 'som', 'removed': true},
      {'value': 'else', 'added': true},
      {'value': 'ething'}
    ];
    console.log('expect:som=removed,else=added,ething=same');
    console.log(mergeDiffs([diff_0, diff_1]));
}

function testMergedDiffsRemove() {
  /* Remove exactly 1 chunk */ 
  diff_0 = [
    {'value': 'hello'},
    {'value': ' there', 'added': true},
  ]
  diff_1 = [
    {'value': 'hello'},
    {'value': ' there', 'removed': true},
  ]
  console.log('expect:hello=same, there=removed');
  console.log(mergeDiffs([diff_0, diff_1]));
  

  /* Remove everything */
  diff_0 = [
    {'value': 'hello'},
    {'value': ' there', 'added': true},
  ]
  diff_1 = [
    {'value': 'hello there', 'removed': true},
  ]
  console.log('expect:hello=removed, there=removed');
  console.log(mergeDiffs([diff_0, diff_1]));
  

  /* Remove in the middle of two parts */
  diff_0 = [
    {'value': 'hello'},
    {'value': ' there', 'added': true},
  ]

  diff_1 = [
    {'value': 'hel'},
    {'value': 'lo th', 'removed': true},
    {'value': 'ere'},
  ]
  console.log('expect:hel=same,lo=removed, th=removed,ere=added');
  console.log(mergeDiffs([diff_0, diff_1]));

  /* Remove over many complete parts */ 
  diff_0 = [
    {'value': 'hello'},
    {'value': ' there', 'added': true},
    {'value': ' Constellation'},
    {'value': '. you are', 'added': true},
    {'value': 'cool.', 'added': true}
  ]
  diff_1 = [
    {'value': 'hello'},
    {'value': ' there Constellation. you are', 'removed': true},
    {'value': 'cool.'},
  ]
  console.log('expect:hello=same, there=removed, Constellation=removed' + 
    '. you are=removed,cool.=added');
  console.log(mergeDiffs([diff_0, diff_1]));

  /* Remove part of 1 chunk */
  diff_0 = [
    {'value': 'something'}
  ];
  diff_1 = [
    {'value': 'so'},
    {'value': 'met', 'removed': true},
    {'value': 'hing'},
  ];
  console.log('expect:so=same,met=removed,hing=same');
  console.log(mergeDiffs([diff_0, diff_1]));

  /* Remove with a remove in the middle of previous diff  */
  diff_0 = [
    {'value': 'something'}
  ];
  diff_1 = [
    {'value': 'so'},
    {'value': 'met', 'removed': true},
    {'value': 'hing'},
  ];
  diff_2 = [
    {'value': 'so'},
    {'value': 'hi', 'removed': true},
    {'value': 'ng'}
  ]
  console.log('expect:so=same,met=removed,hi=removed,ng=same');
  console.log(mergeDiffs([diff_0, diff_1, diff_2]));

  /* Multiple removes in diff_1 */
  diff_0 = [
    {'value': 'something xxx yyy'}
  ];

  diff_1 = [
    {'value': 'so', 'removed': true},
    {'value': 'mething xx'},
    {'value': 'x yy', 'removed': true},
    {'value': 'y'},
  ];
  console.log('expect:so=removed,mething xx=same,x yy=removed,y=same');
  console.log(mergeDiffs([diff_0, diff_1]));
}

function testMergedDiffsAdd() {
  /** Adding at the end */

  diff_0 = [
    {'value': 'hello'},
    {'value': ' there', 'added': true},
  ]

  diff_1 = [
    {'value': 'hello there'},
    {'value': ' again', 'added': true},
  ]
  console.log("expect:hello=same, there=added, again=added");
  console.log(mergeDiffs([diff_0, diff_1]));

  /** Adding at the very beginning  */
  diff_0 = [
    {'value': 'hello'},
    {'value': ' there', 'added': true},
  ]

  diff_1 = [
    {'value': 'why ', 'added': true},
    {'value': 'hello there'},
  ]
  console.log("expect:why =added,hello=same, there=added");
  console.log(mergeDiffs([diff_0, diff_1]));
 

 /* Adding at beginning of a chunk in the middle */
  diff_0 = [
    {'value': 'hello'},
    {'value': ' there', 'added': true},
  ]

  diff_1 = [
    {'value': 'hello'},
    {'value': 'xxxx', 'added': true},
    {'value': ' there'},
  ]
  console.log('expect:hello=same,xxxx=added, there=added');
  console.log(mergeDiffs([diff_0, diff_1]));


  /** Adding in the middle of a chunk */
  diff_0 = [
    {'value': 'hello'},
    {'value': ' there', 'added': true},
  ]

  diff_1 = [
    {'value': 'hello th'},
    {'value': 'xxxx', 'added': true},
    {'value': 'ere'},
  ]
  console.log('expect:hello=same, th=added,xxxx=added,ere=added');
  console.log(mergeDiffs([diff_0, diff_1]));

  /** Adding to a diff with removed parts  */
  diff_0 = [
    {'value': 'hello there'},
  ]
  diff_1 = [
    {'value': 'he'},
    {'value': 'llo the', 'removed': true},
    {'value': 're'},
  ]
  diff_2 = [
    {'value': 'h'},
    {'value': 'something', 'added': true},
    {'value': 'ere'}
  ]
  // Expectation is undetermined based on spec
  console.log('expect:h=same,something=added,e=same,llo the=removed,re=same')
  console.log(mergeDiffs([diff_0, diff_1, diff_2]));

  /** Preserve order of operations if you 
    remove something and then add to the same place */
  diff_0 = [
    {'value': 'something'}
  ];
  diff_1 = [
    {'value': 'so'},
    {'value': 'met', 'removed': true},
    {'value': 'hing'},
  ];
  diff_2 = [
    {'value': 'so'},
    {'value': 'woo', 'added': true},
    {'value': 'hing'}
  ]
  console.log('expect:so=same,met=removed,woo=added,hing=same');
  console.log(mergeDiffs([diff_0, diff_1, diff_2]));
}

testMergedDiffsAdd();
testMergedDiffsRemove();
testMergedDiffsRegression();

/*
After all these functions run, get this:
events.js:160
      throw er; // Unhandled 'error' event
      ^

Error: ENOENT: no such file or directory, open 'C:\Users\caitl\Documents\MIT\con
stellation-fork\server\test\log\constellation-mergeDiffs.log'
    at Error (native)

I'm running the file by doing 'node mergeDiffs.js' in terminal.
*/


