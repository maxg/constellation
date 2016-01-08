package eclipseonut;

import javax.script.Bindings;
import javax.script.SimpleBindings;

import org.eclipse.core.runtime.Assert;
import org.eclipse.jface.text.BadLocationException;
import org.eclipse.jface.text.DocumentEvent;
import org.eclipse.jface.text.IDocument;
import org.eclipse.jface.text.IDocumentListener;
import org.eclipse.jface.text.ITextSelection;
import org.eclipse.jface.viewers.ISelection;
import org.eclipse.jface.viewers.ISelectionChangedListener;
import org.eclipse.jface.viewers.ISelectionProvider;
import org.eclipse.jface.viewers.SelectionChangedEvent;
import org.eclipse.swt.custom.CaretEvent;
import org.eclipse.swt.custom.CaretListener;
import org.eclipse.swt.custom.StyledText;
import org.eclipse.swt.widgets.Control;
import org.eclipse.swt.widgets.Display;
import org.eclipse.ui.texteditor.ITextEditor;

public class ShareDoc implements IDocumentListener {
    
    private final JSEngine js;
    private final IDocument local;
    private final Bindings env = new SimpleBindings();
    private boolean syncing = false;
    
    public ShareDoc(JSEngine js, IDocument local, Object contexts, ITextEditor editor) {
        this.js = js;
        this.local = local;
        env.put("contexts", contexts);
        env.put("sharedoc", this);
        
        ISelectionProvider selectionProvider = editor.getSelectionProvider();
        selectionProvider.addSelectionChangedListener(new ISelectionChangedListener() {
            @Override
            public void selectionChanged(SelectionChangedEvent event) {
                ISelection selection = selectionProvider.getSelection();
                if (selection instanceof ITextSelection) {
                    ITextSelection textSelection = (ITextSelection)selection;
                    int offset = textSelection.getOffset();
                    System.out.println("Selection Offset: " + offset);
                }
            }
        });
        
        // XXX: used as part of interim user ID below. Needs to be here to avoid
        // scoping issues with "this".
        int hashCode = this.hashCode();
        
        StyledText text = (StyledText)editor.getAdapter(Control.class);
        text.addCaretListener(new CaretListener() {
            @Override
            public void caretMoved(CaretEvent event) {
                System.out.println("Caret Offset: " + event.caretOffset);
                js.exec((engine) -> {
                    // XXX: temporarily use ShareDoc's hashcode to ID users uniquely
                    // Need to fetch userID from ShareJS class.
                    env.put("userId", hashCode);
                    env.put("offset", event.caretOffset);
                    engine.eval("contexts.cursors.caretMoved(userId, offset)", env);
                });
            }
        });
        
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
        local.removeDocumentListener(this);
        
        js.exec((engine) -> {
            env.put("detach", engine.get("detach"));
            engine.eval("detach(contexts, sharedoc)", env);
        });
    }
    
    public void onRemoteInsert(int pos, String text) {
        Assert.isNotNull(Display.getCurrent());
        syncing = true;
        try {
            local.replace(pos, 0, text);
        } catch (BadLocationException ble) {
            Log.error("Bad location on remote insert " + pos + " (" + text.length() + ")", ble);
        }
        syncing = false;
    }
    
    public void onRemoteRemove(int pos, int length) {
        Assert.isNotNull(Display.getCurrent());
        syncing = true;
        try {
            local.replace(pos, length, "");
        } catch (BadLocationException ble) {
            Log.error("Bad location on remote remove " + pos + " " + length, ble);
        }
        syncing = false;
    }
    
    public void onRemoteCaretMove(int userId, int remoteOffset) {
        Assert.isNotNull(Display.getCurrent());
        // TODO: modify this userId check to actually use id, see above usage of hashcode
        if (userId != this.hashCode()) {
            System.out.println("remote caret moved to " + remoteOffset);
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
