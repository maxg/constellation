package eclipseonut;

import javax.script.Bindings;
import javax.script.SimpleBindings;

import org.eclipse.core.runtime.Assert;
import org.eclipse.jface.text.BadLocationException;
import org.eclipse.jface.text.DocumentEvent;
import org.eclipse.jface.text.IDocument;
import org.eclipse.jface.text.IDocumentListener;
import org.eclipse.swt.widgets.Display;

public class ShareDoc implements IDocumentListener {
    
    private final JSEngine js;
    private final IDocument local;
    private final Bindings env = new SimpleBindings();
    private boolean syncing = false;
    
    public ShareDoc(JSEngine js, IDocument local, Object ctx) {
        this.js = js;
        this.local = local;
        
        env.put("ctx", ctx);
        env.put("sharedoc", this);
        
        js.exec((engine) -> {
            env.put("attach", engine.get("attach"));
            String current = (String)engine.eval("attach(ctx, sharedoc)", env);
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
            engine.eval("detach(ctx, sharedoc)", env);
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
    
    private void onLocalInsert(int pos, String text) {
        Assert.isNotNull(Display.getCurrent());
        js.exec((engine) -> {
            env.put("pos", pos);
            env.put("text", text);
            engine.eval("ctx.insert(pos, text)", env);
        });
    }
    
    private void onLocalRemove(int pos, int length) {
        Assert.isNotNull(Display.getCurrent());
        js.exec((engine) -> {
            env.put("pos", pos);
            env.put("length", length);
            engine.eval("ctx.remove(pos, length)", env);
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
