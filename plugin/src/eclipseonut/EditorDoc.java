package eclipseonut;

import static eclipseonut.Util.assertNotNull;

import java.util.concurrent.CancellationException;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

import org.eclipse.jface.text.IDocument;
import org.eclipse.ui.IFileEditorInput;
import org.eclipse.ui.texteditor.ITextEditor;

/**
 * Links an ITextEditor to a ShareDoc.
 */
public class EditorDoc {
    
    private final Future<ShareDoc> doc;
    
    public EditorDoc(Collaboration collaboration, ITextEditor editor, IFileEditorInput input) {
        IDocument local = assertNotNull(editor.getDocumentProvider().getDocument(input),
                "Missing document for text editor");
        this.doc = collaboration.open(local, input.getFile(), editor);
        new Thread(() -> {
            try {
                doc.get();
            } catch (CancellationException ce) {
                // user declined to sync the doc for collaborative editing
                editor.close(true);
            } catch (InterruptedException | ExecutionException e) {
                Log.error("Error creating shared doc", e);
                Activator.showErrorDialog(editor.getSite().getShell(), "Error creating shared doc", e);
            }
        }).start();
    }
    
    public void stop() {
        try {
            doc.get(2, TimeUnit.SECONDS).close();
        } catch (CancellationException ce) {
            // nothing more to stop
        } catch (TimeoutException te) {
            Log.error("Leaking pending shared doc during collaboration stop", te);
        } catch (InterruptedException | ExecutionException e) {
            Log.error("No shared doc during collaboration stop", e);
        }
    }
}
