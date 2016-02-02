package eclipseonut;

import java.lang.reflect.InvocationTargetException;
import java.util.Map;
import java.util.Optional;

import org.eclipse.core.commands.AbstractHandler;
import org.eclipse.core.commands.ExecutionEvent;
import org.eclipse.core.commands.ExecutionException;
import org.eclipse.jface.dialogs.ProgressMonitorDialog;
import org.eclipse.swt.widgets.Display;
import org.eclipse.ui.commands.ICommandService;
import org.eclipse.ui.commands.IElementUpdater;
import org.eclipse.ui.menus.UIElement;

public class Reconnect extends AbstractHandler implements IElementUpdater {
    private static final String COMMAND = "eclipseonut.command.reconnect";
    
    private final ICommandService service = (ICommandService)Activator.getDefault().getWorkbench().getService(ICommandService.class);
    public static Optional<Collaboration> collabCache = Optional.empty();
    
    private static final int MAX_TIME = 30000;
    private int retryTime = 1000;
    
    @Override
    public Object execute(ExecutionEvent event) throws ExecutionException {
        if (collabCache.isPresent()) {
            System.out.println("Executing reconnect");
            collabCache.get().stop();
            reconnect();
        } else {
            System.out.println("Nothing to reconnect.");
        }
        
        service.refreshElements(COMMAND, null);
        return null;
    }
    
    private void reconnect() {
        System.out.println("attempting with retry: " + retryTime);
        try {
            new ProgressMonitorDialog(null).run(true, true, (monitor) -> {
                monitor.beginTask("Eclipseonut is disconnected from the server. Reconnecting...", 1);

                Display.getDefault().asyncExec(() -> {
                    try {
                        collabCache.get().restart();
                    } catch (Exception e) {
                        System.out.println("Reconnection failed, retrying.");
                        // e.printStackTrace();
                        retryTime = Math.min(2*retryTime, MAX_TIME);
                        int newTime = (int)(retryTime * Math.random());
                        Display.getDefault().timerExec(newTime, () -> {
                            reconnect();
                        });
                    }
                });

                monitor.done();
            });
        } catch (InterruptedException ie) {
            ie.printStackTrace();
        } catch (InvocationTargetException ite) {
            ite.printStackTrace();
        }
        
        
    }

    @Override
    public void updateElement(UIElement element, @SuppressWarnings("rawtypes") Map parameters) {
        //setBaseEnabled(collabCache.isPresent());
    }
}
