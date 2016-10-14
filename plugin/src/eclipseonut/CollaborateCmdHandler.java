package eclipseonut;

import java.io.IOException;
import java.lang.reflect.InvocationTargetException;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ExecutionException;

import org.eclipse.core.commands.AbstractHandler;
import org.eclipse.core.commands.ExecutionEvent;
import org.eclipse.core.resources.IProject;
import org.eclipse.core.resources.IWorkspaceRoot;
import org.eclipse.core.resources.ResourcesPlugin;
import org.eclipse.core.runtime.Assert;
import org.eclipse.core.runtime.IProgressMonitor;
import org.eclipse.core.runtime.SubMonitor;
import org.eclipse.jdt.annotation.Nullable;
import org.eclipse.jface.dialogs.MessageDialog;
import org.eclipse.jface.dialogs.ProgressMonitorDialog;
import org.eclipse.swt.widgets.Shell;
import org.eclipse.ui.PartInitException;
import org.eclipse.ui.PlatformUI;
import org.eclipse.ui.commands.ICommandService;
import org.eclipse.ui.commands.IElementUpdater;
import org.eclipse.ui.menus.UIElement;

public class CollaborateCmdHandler extends AbstractHandler implements IElementUpdater, CollaborationListener {
    
    private static final String COLLABORATE = "eclipseonut.command.collaborate";
    
    private Optional<Collaboration> collab = Optional.empty();
    
    @Override
    public @Nullable Object execute(@Nullable ExecutionEvent event) {
        this.setBaseEnabled(false);
        if (state() == CollaborationState.NONE) {
            start();
        } else {
            stop();
        }
        this.setBaseEnabled(true);
        onCollaborationState();
        return null;
    }
    
    @Override
    public void updateElement(UIElement element, @SuppressWarnings("rawtypes") Map parameters) {
        element.setIcon(state().icon);
        element.setText(state().description);
        element.setChecked(state() != CollaborationState.NONE);
    }
    
    @Override
    public void onCollaborationState() {
        Debug.trace();
        Activator.getService(ICommandService.class).refreshElements(COLLABORATE, null);
    }
    
    private CollaborationState state() {
        return collab.isPresent() ? collab.get().state() : CollaborationState.NONE;
    }
    
    private void start() {
        Debug.trace();
        Assert.isTrue( ! collab.isPresent());
        try {
            IProject project = selectProject();
            new ProgressMonitorDialog(null).run(true, true, monitor -> startCollaboration(project, monitor));
        } catch (InvocationTargetException ite) {
            Activator.showErrorDialog(null, "Error starting collaboration", ite);
        } catch (InterruptedException ie) {
            // canceled
        }
    }
    
    private void stop() {
        Debug.trace();
        Assert.isTrue(collab.isPresent());
        final boolean stop;
        if (state() == CollaborationState.DISCONNECTED) {
            stop = MessageDialog.openConfirm(null, "Collaboration disconnected",
                    "Collaboration on " + collab.get().project.getName() + " with " + collab.get().partner + " disconnected.");
        } else {
            collab.get().ping();
            stop = new StatusDialog(null, collab.get()).open() == StatusDialog.STOP;
        }
        if (stop) {
            collab.get().stop();
            collab = Optional.empty();
        }
    }
    
    private IProject selectProject() throws InterruptedException {
        final Shell shell = PlatformUI.getWorkbench().getActiveWorkbenchWindow().getShell();
        final IWorkspaceRoot root = ResourcesPlugin.getWorkspace().getRoot();
        
        SelectProjectDialog dialog = new SelectProjectDialog(shell, root);
        dialog.open(); // blocks
        
        return dialog.getSelectedProject();
    }
    
    private void startCollaboration(IProject project, @Nullable IProgressMonitor monitor) throws InvocationTargetException, InterruptedException {
        SubMonitor progress = SubMonitor.convert(monitor, "Start collaboration", 10);
        try {
            collab = Optional.of(Collaboration.connect(project, this, progress));
            collab.get().start();
        } catch (ExecutionException | IOException | PartInitException e) {
            throw new InvocationTargetException(e);
        }
    }
}
