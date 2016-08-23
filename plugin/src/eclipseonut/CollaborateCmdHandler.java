package eclipseonut;

import java.io.IOException;
import java.lang.reflect.InvocationTargetException;
import java.util.EnumMap;
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
import org.eclipse.jface.resource.ImageDescriptor;
import org.eclipse.swt.widgets.Shell;
import org.eclipse.ui.PartInitException;
import org.eclipse.ui.PlatformUI;
import org.eclipse.ui.commands.ICommandService;
import org.eclipse.ui.commands.IElementUpdater;
import org.eclipse.ui.menus.UIElement;

import eclipseonut.Collaboration.State;

public class CollaborateCmdHandler extends AbstractHandler implements IElementUpdater, CollaborationListener {
    
    private static final String COLLABORATE = "eclipseonut.command.collaborate";
    
    private static ImageDescriptor ICON_STARTED = Activator.getIcon("collab-started");
    private static final Map<State, ImageDescriptor> ICONS = new EnumMap<>(State.class);
    static {
        ICONS.put(State.NONE, Activator.getIcon("collab-stopped"));
        ICONS.put(State.RECONNECTING, Activator.getIcon("collab-warning"));
        ICONS.put(State.ALONE, Activator.getIcon("collab-warning"));
        ICONS.put(State.DISCONNECTED, Activator.getIcon("collab-error"));
    }
    
    private Optional<Collaboration> collab = Optional.empty();
    
    @Override
    public @Nullable Object execute(@Nullable ExecutionEvent event) {
        this.setBaseEnabled(false);
        if (state() == State.NONE) {
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
        element.setIcon(ICONS.getOrDefault(state(), ICON_STARTED));
        element.setText(Activator.getString("command.collaborate." + state().name().toLowerCase()));
        element.setChecked(state() != State.NONE);
    }
    
    @Override
    public void onCollaborationState() {
        Debug.trace();
        Activator.getService(ICommandService.class).refreshElements(COLLABORATE, null);
    }
    
    private State state() {
        return collab.isPresent() ? collab.get().state() : State.NONE;
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
        boolean stop;
        String description = "on " + collab.get().project.getName() + " with " + collab.get().partner;
        if (state() == State.DISCONNECTED) {
            stop = MessageDialog.openConfirm(null, "Collaboration disconnected",
                    "Collaboration " + description + " disconnected.");
        } else {
            stop = new MessageDialog(null, "Stop collaboration?", null,
                    "Stop collaborating " + description + "?",
                    MessageDialog.CONFIRM, 0, "Stop", "Don't stop").open() == 0;
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
