package eclipseonut;

import java.lang.reflect.InvocationTargetException;
import java.util.Map;
import java.util.Optional;

import org.eclipse.core.commands.AbstractHandler;
import org.eclipse.core.commands.ExecutionEvent;
import org.eclipse.core.commands.ExecutionException;
import org.eclipse.core.resources.IProject;
import org.eclipse.core.resources.IWorkspaceRoot;
import org.eclipse.core.resources.ResourcesPlugin;
import org.eclipse.core.runtime.Assert;
import org.eclipse.core.runtime.IProgressMonitor;
import org.eclipse.core.runtime.SubMonitor;
import org.eclipse.jface.dialogs.MessageDialog;
import org.eclipse.jface.dialogs.ProgressMonitorDialog;
import org.eclipse.swt.widgets.Shell;
import org.eclipse.ui.PlatformUI;
import org.eclipse.ui.commands.ICommandService;
import org.eclipse.ui.commands.IElementUpdater;
import org.eclipse.ui.menus.UIElement;

import eclipseonut.ShareJS.Settings;

/**
 * Handles collaboration commands from the UI.
 */
public class Collaborate extends AbstractHandler implements IElementUpdater {
    
    private static final String COMMAND = "eclipseonut.command.collaborate";
    
    private final ICommandService service = (ICommandService)Activator.getDefault().getWorkbench().getService(ICommandService.class);
    private Optional<Collaboration> collab = Optional.empty();
    
    public Object execute(ExecutionEvent event) throws ExecutionException {
        // TODO: handle disconnects => dialog box, possible red button
        // TODO: halt the server or something more clever
        // Perhaps drop a hook to the websocket and just close it
        // and figure out how to respond
        // Think about closing laptops and reopening in class
        // TODO: check whether server can maintain connections - can Version Numbers be added to the protocol?
        // TODO: visibility that Collaboration is happening
        // TODO: make more interesting test files
        // TODO: show indicator on the file icon a-la git to see connection status
        // TODO: saving/saved indicator a-la Google Docs
        // TODO: send collaborate state to the remote server
        // TODO: send manual stop collaboration to make remote also stop collaborating
        
        
        this.setBaseEnabled(false);
        if (started()) {
            stop();
        } else {
            start();
        }
        service.refreshElements(COMMAND, null);
        this.setBaseEnabled(true);
        
        return null;
    }
    
    public void updateElement(UIElement element, @SuppressWarnings("rawtypes") Map parameters) {
        element.setText(Activator.getString("command.collaborate." + (started() ? "stop" : "start")));
        element.setChecked(started());
    }
    
    private boolean started() {
        return collab.isPresent();
    }
    
    private void start() {
        Assert.isTrue( ! collab.isPresent());
        try {
            IProject project = selectProject();
            new ProgressMonitorDialog(null).run(true, true, (monitor) -> {
                startCollaboration(project, monitor);
            });
        } catch (InterruptedException ie) {
            // canceled
        } catch (InvocationTargetException ite) {
            String err = "Error starting collaboration";
            MessageDialog.openError(null, err, err + ": " + ite.getMessage());
            Log.warn("Error starting collaboration", ite);
        }
    }
    
    private void stop() {
        Assert.isTrue(collab.isPresent());
        collab.get().stop();
        collab = Optional.empty();
    }
    
    private IProject selectProject() throws InterruptedException {
        IWorkspaceRoot root = ResourcesPlugin.getWorkspace().getRoot();
        Shell shell = PlatformUI.getWorkbench().getActiveWorkbenchWindow().getShell();
        
        EclipseonutDialog dialog = new EclipseonutDialog(shell, root);
        dialog.open();
        
        Object[] projects = dialog.getResult();
        if (projects == null) {
            throw new InterruptedException("Selection cancelled."); 
        }
        return (IProject)projects[0];
    }
    
    private void startCollaboration(IProject project, IProgressMonitor monitor) throws InterruptedException, InvocationTargetException {
        try {
            SubMonitor progress = SubMonitor.convert(monitor, "Eclipseonut", 10);
            Settings settings = ShareJS.getSettings(project, progress.newChild(7));
            collab = Optional.of(Collaboration.start(settings, progress.newChild(3)));
            Reconnect.collabCache = Optional.of(collab.get());
        } catch (InterruptedException ie) {
            throw ie;
        } catch (Exception e) {
            throw new InvocationTargetException(e, e.getMessage());
        }
    }
}
