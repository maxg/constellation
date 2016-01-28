package eclipseonut;

import java.util.HashMap;

import javax.script.Bindings;
import javax.script.SimpleBindings;

import org.eclipse.core.runtime.Assert;
import org.eclipse.jface.text.BadLocationException;
import org.eclipse.jface.text.DocumentEvent;
import org.eclipse.jface.text.IDocument;
import org.eclipse.jface.text.IDocumentListener;
import org.eclipse.jface.text.IPainter;
import org.eclipse.jface.text.ITextOperationTarget;
import org.eclipse.jface.text.ITextSelection;
import org.eclipse.jface.text.ITextViewer;
import org.eclipse.jface.text.ITextViewerExtension5;
import org.eclipse.jface.text.Position;
import org.eclipse.jface.text.source.Annotation;
import org.eclipse.jface.text.source.AnnotationPainter;
import org.eclipse.jface.text.source.AnnotationPainter.IDrawingStrategy;
import org.eclipse.jface.text.source.IAnnotationAccess;
import org.eclipse.jface.text.source.IAnnotationModel;
import org.eclipse.jface.text.source.ISourceViewer;
import org.eclipse.jface.text.source.SourceViewer;
import org.eclipse.jface.viewers.ISelection;
import org.eclipse.jface.viewers.ISelectionChangedListener;
import org.eclipse.jface.viewers.ISelectionProvider;
import org.eclipse.jface.viewers.SelectionChangedEvent;
import org.eclipse.swt.custom.CaretEvent;
import org.eclipse.swt.custom.CaretListener;
import org.eclipse.swt.custom.StyledText;
import org.eclipse.swt.graphics.Color;
import org.eclipse.swt.graphics.GC;
import org.eclipse.swt.graphics.Point;
import org.eclipse.swt.graphics.RGB;
import org.eclipse.swt.widgets.Control;
import org.eclipse.swt.widgets.Display;
import org.eclipse.ui.texteditor.ITextEditor;

public class ShareDoc implements IDocumentListener {
    
    private final JSEngine js;
    private final IDocument local;
    private final Bindings env = new SimpleBindings();
    private boolean syncing = false;
    private final IAnnotationModel annotationModel;
    private final HashMap<String, Position> cursorMap = new HashMap<>();
    private final HashMap<String, Position> selectionMap = new HashMap<>();
    private final AnnotationPainter painter;
    private final ITextEditor editor;
    private final String userid;
    private final StyledText styledText;
    private final ISelectionChangedListener selectionListener;
    private final CaretListener caretListener;
    private static final RGB REMOTE_CURSOR_RGB = new RGB(181, 118, 117);
    private static final RGB REMOTE_SELECTION_RGB = new RGB(242, 222, 222);
    
    public ShareDoc(JSEngine js, IDocument local, String userid, Object contexts, ITextEditor editor) {
        this.js = js;
        this.local = local;
        this.userid = userid;
        env.put("contexts", contexts);
        env.put("sharedoc", this);
        
        // Set up the caret drawer for remote caret moves
        ITextViewer viewer = (ITextViewer)editor.getAdapter(ITextOperationTarget.class);
        AnnotationPainter painter = new AnnotationPainter((ISourceViewer) viewer, new IAnnotationAccess() {
            @Override
            public boolean isTemporary(Annotation annotation) {
                return annotation.isPersistent();
            }
            
            @Override
            public boolean isMultiLine(Annotation annotation) {
                return true;
            }
            
            @Override
            public Object getType(Annotation annotation) {
                return annotation.getType();
            }
        });
        this.editor = editor;
        this.painter = painter;
        ((SourceViewer)viewer).addTextPresentationListener(painter);

        painter.addHighlightAnnotationType("selection");
        painter.setAnnotationTypeColor("selection", new Color(Display.getDefault(), REMOTE_SELECTION_RGB));
        painter.addAnnotationType("caret", "caret");
        painter.addDrawingStrategy("caret", new IDrawingStrategy() {
            private static final int CURSOR_WIDTH = 2;
            @Override
            public void draw(Annotation annotation, GC gc, StyledText textWidget, int offset, int length, Color color) {
                Point cursor = textWidget.getLocationAtOffset(offset);
                if (gc == null) {
                    textWidget.redraw(cursor.x - CURSOR_WIDTH / 2,
                        cursor.y, CURSOR_WIDTH + 1,
                        textWidget.getLineHeight(), false);
                    return;
                }

                final Color foreground = gc.getForeground();
                gc.setForeground(color);
                gc.setLineWidth(CURSOR_WIDTH);
                gc.drawLine(cursor.x, cursor.y,
                    cursor.x,
                    cursor.y + textWidget.getLineHeight());
                gc.setForeground(foreground);
                foreground.dispose();
            }
        });
        painter.setAnnotationTypeColor("caret", new Color(Display.getDefault(), REMOTE_CURSOR_RGB));
        painter.paint(IPainter.CONFIGURATION);
        this.annotationModel = ((ISourceViewer) viewer).getAnnotationModel();
        
        // The Selection Provider uses offset values that are not affected by code folding
        // so we use this listener instead of StyledText.
        ISelectionProvider selectionProvider = editor.getSelectionProvider();
        selectionListener = new ISelectionChangedListener() {
            @Override
            public void selectionChanged(SelectionChangedEvent event) {
                ISelection selection = selectionProvider.getSelection();
                if (selection instanceof ITextSelection) {
                    ITextSelection textSelection = (ITextSelection)selection;
                    int offset = textSelection.getOffset();
                    int length = textSelection.getLength();

                    js.exec((engine) -> {
                        env.put("offset", offset);
                        env.put("length", length);
                        env.put("userId", userid);
                        engine.eval("contexts.cursors.selectionChanged(userId, offset, length)", env);
                    });
                }
            }
        };
        selectionProvider.addSelectionChangedListener(selectionListener);
        
        StyledText text = (StyledText)editor.getAdapter(Control.class);
        this.styledText = text;
        caretListener = new CaretListener() {
            @Override
            public void caretMoved(CaretEvent event) {
                js.exec((engine) -> {
                    int offset = event.caretOffset;
                    if (viewer instanceof ITextViewerExtension5) {
                        ITextViewerExtension5 extension = (ITextViewerExtension5) viewer;
                        offset = extension.widgetOffset2ModelOffset(offset);
                        if (offset == -1) {
                            // the previous conversion failed, set new offset to 0 to avoid exceptions.
                            offset = 0;
                        }
                    }
                    
                    env.put("userId", userid);
                    env.put("offset", offset);
                    engine.eval("contexts.cursors.caretMoved(userId, offset)", env);
                });
            }
        };
        text.addCaretListener(caretListener);
        
        js.exec((engine) -> {
            env.put("attach", engine.get("attach"));
            String current = (String)engine.eval("attach(contexts, sharedoc)", env);
            if ( ! local.get().equals(current)) {
                local.set(current);
            }
        });
        
        local.addDocumentListener(this);
    }

    public void close() {
        // TODO: Check that removing these listeners are sufficient
        local.removeDocumentListener(this);
        painter.deactivate(true);
        styledText.removeCaretListener(caretListener);
        ISelectionProvider selectionProvider = editor.getSelectionProvider();
        selectionProvider.removeSelectionChangedListener(selectionListener);
        
        js.exec((engine) -> {
            env.put("detach", engine.get("detach"));
            engine.eval("detach(contexts, sharedoc)", env);
        });
    }
    
    public void onRemoteInsert(int pos, String text) {
        Assert.isNotNull(Display.getCurrent());
        syncing = true;
        try {
            Point selection = styledText.getSelection();
            int offset = styledText.getCaretOffset();
            local.replace(pos, 0, text);
            if (selection.x == offset) {
                // reverse the selection to correctly anchor it.
                Point newSelection = styledText.getSelection();
                styledText.setSelection(newSelection.y, newSelection.x);
            }
        } catch (BadLocationException ble) {
            Log.error("Bad location on remote insert " + pos + " (" + text.length() + ")", ble);
        }
        syncing = false;
    }
    
    public void onRemoteRemove(int pos, int length) {
        Assert.isNotNull(Display.getCurrent());
        syncing = true;
        try {
            Point selection = styledText.getSelection();
            int offset = styledText.getCaretOffset();
            local.replace(pos, length, "");
            if (selection.x == offset) {
                // reverse the selection to correctly anchor it.
                Point newSelection = styledText.getSelection();
                styledText.setSelection(newSelection.y, newSelection.x);
            }
        } catch (BadLocationException ble) {
            Log.error("Bad location on remote remove " + pos + " " + length, ble);
        }
        syncing = false;
    }
    
    public void onRemoteCaretMove(String userid, int offset) {
        Assert.isNotNull(Display.getCurrent());
        if (!userid.equals(this.userid)) {
            // the AnnotationPainter API does not appear to offer a better way to remove
            // previously drawn cursors, so we call deactivate(true) to do so.
            painter.deactivate(true);
            if (cursorMap.containsKey(userid)) {
                cursorMap.get(userid).setOffset(offset);
            } else {
                Annotation annotation = new Annotation("caret", true, "");
                Position position = new Position(offset);
                annotationModel.addAnnotation(annotation, position);
                cursorMap.put(userid, position);
            }
            painter.paint(IPainter.CONFIGURATION);
        }
    }
    
    public void onRemoteSelection(String userid, int offset, int length) {
        Assert.isNotNull(Display.getCurrent());
        if (!userid.equals(this.userid)) {
            painter.deactivate(true);
            if (selectionMap.containsKey(userid)) {
                Position position = selectionMap.get(userid);
                position.setOffset(offset);
                position.setLength(length);
            } else {
                Annotation annotation = new Annotation("selection", true, "");
                Position position = new Position(offset, length);
                annotationModel.addAnnotation(annotation, position);
                selectionMap.put(userid, position);
            }
            painter.paint(IPainter.CONFIGURATION);
        }
    }
    
    private void onLocalInsert(int pos, String text) {
        Assert.isNotNull(Display.getCurrent());
        js.exec((engine) -> {
            env.put("pos", pos);
            env.put("text", text);
            engine.eval("contexts.text.insert(pos, text)", env);
        });
    }
    
    private void onLocalRemove(int pos, int length) {
        Assert.isNotNull(Display.getCurrent());
        js.exec((engine) -> {
            env.put("pos", pos);
            env.put("length", length);
            engine.eval("contexts.text.remove(pos, length)", env);
        });
    }
    
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
}
