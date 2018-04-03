package constellation;

import static constellation.Util.startThread;

import java.time.Duration;
import java.util.Arrays;
import java.util.EventObject;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;

import org.eclipse.core.resources.IMarker;
import org.eclipse.core.resources.IResource;
import org.eclipse.core.resources.IResourceChangeEvent;
import org.eclipse.core.resources.IResourceChangeListener;
import org.eclipse.core.resources.ResourcesPlugin;
import org.eclipse.core.runtime.Assert;
import org.eclipse.core.runtime.CoreException;
import org.eclipse.jface.text.BadLocationException;
import org.eclipse.jface.text.DocumentEvent;
import org.eclipse.jface.text.IDocument;
import org.eclipse.jface.text.IDocumentListener;
import org.eclipse.jface.text.ITextOperationTarget;
import org.eclipse.jface.text.ITextViewerExtension5;
import org.eclipse.jface.text.source.ISourceViewer;
import org.eclipse.swt.custom.StyledText;
import org.eclipse.swt.graphics.Point;
import org.eclipse.swt.widgets.Control;
import org.eclipse.swt.widgets.Display;
import org.eclipse.ui.PlatformUI;
import org.eclipse.ui.ide.ResourceUtil;
import org.eclipse.ui.texteditor.ITextEditor;

public class ShareDoc {
    
    private static final Duration CURSOR_DEBOUNCE_DELAY = Duration.ofMillis(1500);
    
    private final Collaboration collab;
    private final Object sharedbDoc;
    private final IDocument local;
    private final ITextEditor editor;
    private final StyledText styledText;
    private final ISourceViewer viewer;
    
    private final ShareCursorAnnotations cursors;
    
    private final IDocumentListener documentListener;
    private final IResourceChangeListener resourceChangeListener;
    private final BlockingQueue<EventObject> cursorEvents = new LinkedBlockingQueue<>();
    private Marker[] currentMarkers = new Marker[] {};
    private final Thread cursorEventThread;
    
    private boolean syncing = false;
    
    public ShareDoc(Collaboration collab, Object sharedbDoc, IDocument local, ITextEditor editor) {
        Debug.trace();
        this.collab = collab;
        this.sharedbDoc = sharedbDoc;
        this.local = local;
        this.editor = editor;
        this.styledText = (StyledText)editor.getAdapter(Control.class);
        this.viewer = (ISourceViewer)editor.getAdapter(ITextOperationTarget.class);
        
        final IResource resource = ResourceUtil.getResource(editor.getEditorInput());
        ResourcesPlugin.getWorkspace().addResourceChangeListener(this.resourceChangeListener = new IResourceChangeListener() {
            @Override
            public void resourceChanged(IResourceChangeEvent event) {
                // runs on worker thread
                try {
                    final Marker[] markers = localToRemoteMarkers(resource.findMarkers(IMarker.PROBLEM, true, IResource.DEPTH_INFINITE));
                    if (!Arrays.deepEquals(currentMarkers, markers)) {
                        currentMarkers = markers;
                        PlatformUI.getWorkbench().getDisplay().asyncExec(() -> onLocalMarkersUpdate());
                    }
                } catch (CoreException e) {
                    e.printStackTrace();
                }
            }
        }, IResourceChangeEvent.POST_BUILD);

        this.cursors = new ShareCursorAnnotations(viewer);
        
        collab.jse.exec(js -> {
            String current = (String)js.invocable.invokeFunction("attach", sharedbDoc, this);
            if ( ! local.get().equals(current)) {
                local.set(current);
            }
        });
        
        local.addDocumentListener(this.documentListener = new IDocumentListener() {
            public void documentAboutToBeChanged(DocumentEvent event) { }
            public void documentChanged(DocumentEvent event) {
                if (syncing) { return; }
                if (event.getLength() > 0) {
                    onLocalRemove(event.getOffset(), event.getLength());
                }
                if ( ! event.getText().isEmpty()) {
                    onLocalInsert(event.getOffset(), event.getText());
                }
            }
        });
        
        editor.getSelectionProvider().addSelectionChangedListener(cursorEvents::add);
        styledText.addCaretListener(cursorEvents::add);
        
        this.cursorEventThread = startThread(() -> {
            try {
                while ( ! Thread.interrupted()) {
                    cursorEvents.take();
                    PlatformUI.getWorkbench().getDisplay().syncExec(this::onLocalCursorChange);
                    cursorEvents.clear();
                    Thread.sleep(CURSOR_DEBOUNCE_DELAY.toMillis());
                }
            } catch (InterruptedException ie) {}
        });
    }
    
    public void close() {
        Debug.trace();
        cursors.close();
        
        collab.jse.exec(js -> js.invocable.invokeFunction("close", sharedbDoc));
        
        local.removeDocumentListener(documentListener);
        editor.getSelectionProvider().removeSelectionChangedListener(cursorEvents::add);
        styledText.removeCaretListener(cursorEvents::add);
        ResourcesPlugin.getWorkspace().removeResourceChangeListener(resourceChangeListener);
        cursorEventThread.interrupt();
    }
    
    public void onRemoteInsert(int offset, String text) {
        Assert.isNotNull(Display.getCurrent());
        
        syncing = true;
        try {
            replaceAndRestoreSelection(offset, 0, text);
        } catch (BadLocationException ble) {
            Log.error("Bad location on remote insert " + offset + " (" + text.length() + ")", ble);
        }
        syncing = false;
    }
    
    public void onRemoteRemove(int offset, int length) {
        Assert.isNotNull(Display.getCurrent());
        
        syncing = true;
        try {
            replaceAndRestoreSelection(offset, length, "");
        } catch (BadLocationException ble) {
            Log.error("Bad location on remote remove " + offset + " " + length, ble);
        }
        syncing = false;
    }
    
    /*
     * Work around {@link IDocument#replace} making updated text selection left-to-right.
     */
    private void replaceAndRestoreSelection(int offset, int length, String text) throws BadLocationException {
        final Point selection = styledText.getSelection();
        final boolean reversed = selection.x != selection.y && selection.x == styledText.getCaretOffset();
        final boolean containing = selection.x <= modelToWidgetOffset(offset) && selection.y > modelToWidgetOffset(offset+length);
        local.replace(offset, length, text);
        if (containing) {
            styledText.setSelection(selection.x, selection.y - length + text.length());
        }
        if (reversed) {
            styledText.setSelection(styledText.getSelection().y, styledText.getSelection().x);
        }
    }
    
    public void onRemoteCursorUpdate(String username, int[] coordinates) {
        Assert.isNotNull(Display.getCurrent());
        if (coordinates.length == 3) {
            cursors.update(username, coordinates[0], coordinates[1], coordinates[2]);
        } else {
            cursors.update(username, coordinates[0], coordinates[0], 0);
        }
    }
    
    private void onLocalInsert(int offset, String text) {
        Assert.isNotNull(Display.getCurrent());
        collab.jse.exec(js -> js.invocable.invokeFunction("submitInsert", sharedbDoc, offset, text));
    }
    
    private void onLocalRemove(int offset, int length) {
        Assert.isNotNull(Display.getCurrent());
        collab.jse.exec(js -> js.invocable.invokeFunction("submitRemove", sharedbDoc, offset, length));
    }
    
    private void onLocalCursorChange() {
        Assert.isNotNull(Display.getCurrent());
        
        // get caret and selection offsets, and adjust for code folding
        // editor selection provider would have adjusted selection coordinates but doesn't have caret
        final int offset = widgetToModelOffset(styledText.getCaretOffset());
        final Point selection = styledText.getSelection();
        final int start;
        final int length;
        if (selection.x == selection.y) {
            start = offset;
            length = 0;
        } else {
            start = widgetToModelOffset(selection.x);
            length = widgetToModelOffset(selection.y) - selection.x;
        }
        
        collab.jse.exec(js -> js.invocable.invokeFunction("submitCursorUpdate", sharedbDoc, offset, start, length));
    }
    
    private void onLocalMarkersUpdate() {
        // jse.exec runs on UI thread
        collab.jse.exec(js -> js.invocable.invokeFunction("submitMarkersUpdate", sharedbDoc, currentMarkers));
    }

    private int widgetToModelOffset(int widgetOffset) {
        if (viewer instanceof ITextViewerExtension5) {
            return ((ITextViewerExtension5)viewer).widgetOffset2ModelOffset(widgetOffset);
        }
        return widgetOffset;
    }
    
    private int modelToWidgetOffset(int modelOffset) {
        if (viewer instanceof ITextViewerExtension5) {
            return ((ITextViewerExtension5)viewer).modelOffset2WidgetOffset(modelOffset);
        }
        return modelOffset;
    }

    private static Marker[] localToRemoteMarkers(IMarker[] localMarkers) {
        final Marker[] remoteMarkers = new Marker[localMarkers.length];
        for (int i = 0; i < localMarkers.length; i++) {
            final IMarker localMarker = localMarkers[i];
            remoteMarkers[i] = new Marker(
                    localMarker.getAttribute(IMarker.LINE_NUMBER, 1),
                    localMarker.getAttribute(IMarker.MESSAGE, "Missing error message"),
                    localMarker.getAttribute(IMarker.SEVERITY, IMarker.SEVERITY_ERROR));
        }
        return remoteMarkers;
    }
}
