package eclipseonut;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import javax.script.ScriptException;

import org.eclipse.core.resources.IProject;
import org.eclipse.core.runtime.SubMonitor;
import org.eclipse.ui.IEditorReference;
import org.eclipse.ui.IFileEditorInput;
import org.eclipse.ui.IPageListener;
import org.eclipse.ui.IPartListener;
import org.eclipse.ui.IWindowListener;
import org.eclipse.ui.IWorkbench;
import org.eclipse.ui.IWorkbenchPage;
import org.eclipse.ui.IWorkbenchPart;
import org.eclipse.ui.IWorkbenchWindow;
import org.eclipse.ui.PlatformUI;
import org.eclipse.ui.texteditor.ITextEditor;

import eclipseonut.ShareJS.Settings;

public class Collaboration {
    
    public static Collaboration start(Settings settings, SubMonitor progress) throws Exception {
        progress.setWorkRemaining(2);
        
        progress.subTask("Connecting");
        ShareJS share = new ShareJS(new JSEngine(), settings.collabid);
        try {
            share.connect();
        } catch (Exception e) {
            e.printStackTrace();
        }
        progress.worked(1);
        
        progress.subTask("Setting up collaboration");
        Collaboration collab = new Collaboration(share, settings.project, settings.userid);
        progress.worked(1);
        
        return collab;
    }
    
    private final ShareJS share;
    private final IProject project;
    private final String userid;
    private final Map<ITextEditor, Collaborative> editors = new ConcurrentHashMap<>();
    
    private Collaboration(ShareJS share, IProject project, String userid) throws ScriptException {
        this.share = share;
        this.project = project;
        this.userid = userid;
        
        start();
    }
    
    public void start() {
        IWorkbench workbench = PlatformUI.getWorkbench();
        workbench.addWindowListener(windowListener);
        for (IWorkbenchWindow window : workbench.getWorkbenchWindows()) {
            windowListener.windowOpened(window);
        }
    }
    
    public void restart() {
        try {
            share.connect();
        } catch (Exception e) {
            e.printStackTrace();
        }
        start();
    }
    
    public void stop() {
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
        editors.forEach((editor, collab) -> {
            Log.warn("Stopping leaked collaborative editor for " + editor.getTitle());
            collab.stop();
        });
        editors.clear();
        share.close();
    }
    
    private final IWindowListener windowListener = new IWindowListener() {
        
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
    };
    
    private final IPageListener pageListener = new IPageListener() {
        
        public void pageActivated(IWorkbenchPage page) { }
        public void pageClosed(IWorkbenchPage page) {
            page.removePartListener(partListener);
        }
        public void pageOpened(IWorkbenchPage page) {
            page.addPartListener(partListener);
            for (IEditorReference editor : page.getEditorReferences()) {
                partListener.partOpened(editor.getPart(false));
            }
        }
    };
    
    private final IPartListener partListener = new IPartListener() {
        
        public void partActivated(IWorkbenchPart part) { }
        public void partBroughtToTop(IWorkbenchPart part) { }
        public void partDeactivated(IWorkbenchPart part) { }
        public void partClosed(IWorkbenchPart part) {
            if ( ! (part instanceof ITextEditor)) { return; }
            editors.computeIfPresent((ITextEditor)part, (editor, collab) -> {
                collab.stop();
                return null; // remove from map
            });
        }
        public void partOpened(IWorkbenchPart part) {
            // only collaborate on text
            if ( ! (part instanceof ITextEditor)) { return; }
            ITextEditor editor = (ITextEditor)part;
            if ( ! (editor.getEditorInput() instanceof IFileEditorInput)) { return; }
            IFileEditorInput input = (IFileEditorInput)editor.getEditorInput();
            
            // only collaborate on files in selected project
            if ( ! (input.getFile().getProject().equals(project))) { return; }
            
            editors.put(editor, new Collaborative(share, userid, editor, input));
        }
    };
}
