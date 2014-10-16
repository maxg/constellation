package eclipseonut;

import java.util.concurrent.CancellationException;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Future;

import org.eclipse.jface.text.IDocument;
import org.eclipse.ui.IFileEditorInput;
import org.eclipse.ui.IPartListener;
import org.eclipse.ui.IPartService;
import org.eclipse.ui.IWorkbenchPart;
import org.eclipse.ui.texteditor.ITextEditor;

public class Collaborative {
    
    private final ITextEditor editor;
    private final IPartService site;
    private ShareDoc doc;
    
    public Collaborative(ShareJS share, ITextEditor editor, IFileEditorInput input) {
        this.editor = editor;
        this.site = (IPartService)editor.getEditorSite().getService(IPartService.class);
        IDocument local = editor.getDocumentProvider().getDocument(input);
        Future<ShareDoc> future = share.open(local, input.getFile());
        new Thread(() -> {
            try {
                doc = future.get();
                site.addPartListener(closeListener);
            } catch (CancellationException ce) {
                // user declined to sync the doc for collaborative editing
                editor.close(true);
            } catch (InterruptedException | ExecutionException e) {
                throw new RuntimeException(e);
            }
        }).start();
    }
    
    private final IPartListener closeListener = new IPartListener() {
        public void partActivated(IWorkbenchPart part) { }
        public void partBroughtToTop(IWorkbenchPart part) { }
        public void partDeactivated(IWorkbenchPart part) { }
        public void partClosed(IWorkbenchPart part) {
            if ( ! (part == editor)) { return; }
            site.removePartListener(this);
            doc.close();
        }
        public void partOpened(IWorkbenchPart part) { }
    };
}
