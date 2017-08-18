package constellation;

import java.io.IOException;
import java.lang.reflect.InvocationTargetException;
import java.util.concurrent.ExecutionException;

import org.eclipse.core.commands.AbstractHandler;
import org.eclipse.core.commands.ExecutionEvent;
import org.eclipse.core.runtime.IProgressMonitor;
import org.eclipse.core.runtime.SubMonitor;
import org.eclipse.jdt.annotation.Nullable;
import org.eclipse.jface.dialogs.Dialog;
import org.eclipse.jface.dialogs.MessageDialog;
import org.eclipse.jface.dialogs.ProgressMonitorDialog;
import org.eclipse.ui.PartInitException;
import org.eclipse.ui.PlatformUI;

public class SetupCmdHandler extends AbstractHandler {
    
    @Override
    public @Nullable Object execute(ExecutionEvent event) {
        try {
            ProgressMonitorDialog dialog = new ProgressMonitorDialog(null);
            dialog.run(true, true, monitor -> test(dialog, monitor));
        } catch (InvocationTargetException ite) {
            Activator.showErrorDialog(null, "Error testing Constellation setup", ite);
        } catch (InterruptedException ie) {
            // canceled
        }
        return null;
    }
    
    private void test(Dialog dialog, @Nullable IProgressMonitor monitor) throws InvocationTargetException, InterruptedException {
        SubMonitor progress = SubMonitor.convert(monitor, "Test connection", 10);
        try {
            Collaboration.test(progress);
            PlatformUI.getWorkbench().getDisplay().asyncExec(() -> {
                MessageDialog.openInformation(dialog.getShell(),
                        "Success",
                        "Successfully authenticated and connected to Constellation server.");
            });
        } catch (ExecutionException | IOException | PartInitException e) {
            throw new InvocationTargetException(e);
        }
    }
}
