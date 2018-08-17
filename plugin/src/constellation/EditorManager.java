package constellation;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import org.eclipse.jdt.annotation.Nullable;
import org.eclipse.ui.IEditorReference;
import org.eclipse.ui.IFileEditorInput;
import org.eclipse.ui.IPageListener;
import org.eclipse.ui.IPartListener;
import org.eclipse.ui.IViewReference;
import org.eclipse.ui.IWindowListener;
import org.eclipse.ui.IWorkbench;
import org.eclipse.ui.IWorkbenchPage;
import org.eclipse.ui.IWorkbenchPart;
import org.eclipse.ui.IWorkbenchWindow;
import org.eclipse.ui.PlatformUI;
import org.eclipse.ui.texteditor.ITextEditor;

public class EditorManager {
    
    private final Collaboration collaboration;
    private final Map<ITextEditor, EditorDoc> editors = new ConcurrentHashMap<>();
    
    private final WindowListener windowListener = new WindowListener();
    private final PageListener pageListener = new PageListener();
    private final PartListener partListener = new PartListener();
    
    public EditorManager(Collaboration collaboration) {
        Debug.trace();
        this.collaboration = collaboration;
    }
    
    public void start() {
        Debug.trace();
        IWorkbench workbench = PlatformUI.getWorkbench();
        workbench.addWindowListener(windowListener);
        for (IWorkbenchWindow window : workbench.getWorkbenchWindows()) {
            windowListener.windowOpened(window);
        }
    }
    
    public void stop() {
        Debug.trace();
        IWorkbench workbench = PlatformUI.getWorkbench();
        workbench.removeWindowListener(windowListener);
        for (IWorkbenchWindow window : workbench.getWorkbenchWindows()) {
            window.removePageListener(pageListener);
            for (IWorkbenchPage page : window.getPages()) {
                page.removePartListener(partListener);
                for (IEditorReference editor : page.getEditorReferences()) {
                    partListener.partClosed(editor.getPart(false));
                }
            }
        }
        editors.forEach((editor, doc) -> {
            Log.warn("Stopped leaked collaborative editor for " + editor.getTitle());
            doc.stop();
        });
        editors.clear();
    }
    
    class WindowListener implements IWindowListener {
        public void windowActivated(IWorkbenchWindow window) { }
        public void windowDeactivated(IWorkbenchWindow window) { }
        public void windowClosed(IWorkbenchWindow window) {
            window.removePageListener(pageListener);
        }
        public void windowOpened(IWorkbenchWindow window) {
            window.addPageListener(pageListener);
            for (IWorkbenchPage page : window.getPages()) {
                pageListener.pageOpened(page);
            }
        }
    }
    
    class PageListener implements IPageListener {
        public void pageActivated(IWorkbenchPage page) { }
        public void pageClosed(IWorkbenchPage page) {
            page.removePartListener(partListener);
        }
        public void pageOpened(IWorkbenchPage page) {
            page.addPartListener(partListener);
            for (IEditorReference editor : page.getEditorReferences()) {
                partListener.partOpened(editor.getPart(false));
            }
            for (IViewReference view : page.getViewReferences()) {
                partListener.partOpened(view.getPart(false));
            }
        }
    }
    
    class PartListener implements IPartListener {
        public void partActivated(IWorkbenchPart part) { }
        public void partBroughtToTop(IWorkbenchPart part) { }
        public void partDeactivated(IWorkbenchPart part) { }
        public void partClosed(@Nullable IWorkbenchPart part) {
            if ( ! (part instanceof ITextEditor)) { return; }
            editors.computeIfPresent((ITextEditor)part, (editor, doc) -> {
                doc.stop();
                return null; // remove from map
            });
        }
        public void partOpened(@Nullable IWorkbenchPart part) {
            // connect new feedback views
            if (part instanceof FeedbackView) {
                ((FeedbackView)part).addAll(collaboration);
                return;
            }
            
            // only collaborate on text files
            if ( ! (part instanceof ITextEditor)) { return; }
            ITextEditor editor = (ITextEditor)part;
            if ( ! (editor.getEditorInput() instanceof IFileEditorInput)) { return; }
            IFileEditorInput input = (IFileEditorInput)editor.getEditorInput();
            
            // only collaborate on files in selected project
            if ( ! input.getFile().getProject().equals(collaboration.project)) { return; }
            
            editors.put(editor, new EditorDoc(collaboration, editor, input));
        }
        
    }
}
