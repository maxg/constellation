package eclipseonut;

import java.lang.reflect.InvocationTargetException;

import org.eclipse.core.commands.AbstractHandler;
import org.eclipse.core.commands.ExecutionEvent;
import org.eclipse.core.commands.ExecutionException;
import org.eclipse.core.resources.IProject;
import org.eclipse.core.resources.ResourcesPlugin;
import org.eclipse.core.runtime.IProgressMonitor;
import org.eclipse.core.runtime.IStatus;
import org.eclipse.core.runtime.Status;
import org.eclipse.core.runtime.SubMonitor;
import org.eclipse.jface.dialogs.MessageDialog;
import org.eclipse.jface.dialogs.ProgressMonitorDialog;
import org.eclipse.ui.dialogs.ElementTreeSelectionDialog;
import org.eclipse.ui.model.BaseWorkbenchContentProvider;
import org.eclipse.ui.model.WorkbenchLabelProvider;

import eclipseonut.ShareJS.Settings;

/**
 * Handles collaboration commands from the UI.
 */
public class Collaborate extends AbstractHandler {
    
    private IProject project;
    private Collaboration collab;
    
    public Object execute(ExecutionEvent event) throws ExecutionException {
        try {
            project = selectProject();
            new ProgressMonitorDialog(null).run(true, true, this::start);
            this.setBaseEnabled(false);
        } catch (InterruptedException ie) {
            // canceled
        } catch (InvocationTargetException ite) {
            String err = "Error starting collaboration";
            MessageDialog.openError(null, err, err + ": " + ite.getMessage());
            Log.warn("Error starting collaboration", ite);
        }
        
        return null;
    }
    
    private IProject selectProject() throws InterruptedException {
        ElementTreeSelectionDialog picker = new ElementTreeSelectionDialog(null, new WorkbenchLabelProvider(), new BaseWorkbenchContentProvider() {
            @Override public boolean hasChildren(Object element) { return false; }
        });
        picker.setInput(ResourcesPlugin.getWorkspace().getRoot());
        picker.setValidator(selection -> selection.length == 1 && selection[0] instanceof IProject
                ? new Status(IStatus.OK, Activator.PLUGIN_ID, "")
                : new Status(IStatus.ERROR, Activator.PLUGIN_ID, "Select a project"));
        picker.open();
        Object[] projects = picker.getResult();
        if (projects == null) {
            throw new InterruptedException();
        }
        return (IProject)projects[0];
    }
    
    private void start(IProgressMonitor monitor) throws InterruptedException, InvocationTargetException {
        try {
            SubMonitor progress = SubMonitor.convert(monitor, "Eclipseonut", 10);
            Settings settings = ShareJS.getSettings(project, progress.newChild(7));
            collab = Collaboration.start(settings, progress.newChild(3));
        } catch (InterruptedException ie) {
            throw ie;
        } catch (Exception e) {
            throw new InvocationTargetException(e, e.getMessage());
        }
    }
}
