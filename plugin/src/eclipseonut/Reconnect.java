package eclipseonut;

import java.util.Map;
import java.util.Optional;

import org.eclipse.core.commands.AbstractHandler;
import org.eclipse.core.commands.ExecutionEvent;
import org.eclipse.core.commands.ExecutionException;
import org.eclipse.ui.commands.ICommandService;
import org.eclipse.ui.commands.IElementUpdater;
import org.eclipse.ui.menus.UIElement;

public class Reconnect extends AbstractHandler implements IElementUpdater {
    private static final String COMMAND = "eclipseonut.command.reconnect";
    
    private final ICommandService service = (ICommandService)Activator.getDefault().getWorkbench().getService(ICommandService.class);
    public static Optional<Collaboration> collabCache = Optional.empty();

    @Override
    public Object execute(ExecutionEvent event) throws ExecutionException {
        if (collabCache.isPresent()) {
            System.out.println("Executing reconnect");
            collabCache.get().restart();
        } else {
            System.out.println("Nothing to reconnect.");
        }
        
        
        service.refreshElements(COMMAND, null);
        
        return null;
    }

    @Override
    public void updateElement(UIElement element, @SuppressWarnings("rawtypes") Map parameters) {
        //setBaseEnabled(collabCache.isPresent());
    }
}
