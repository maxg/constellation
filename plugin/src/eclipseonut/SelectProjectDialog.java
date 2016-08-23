package eclipseonut;

import static eclipseonut.Util.assertNotNull;
import static java.util.Collections.singletonList;

import org.eclipse.core.resources.IProject;
import org.eclipse.core.resources.IResource;
import org.eclipse.core.runtime.IStatus;
import org.eclipse.core.runtime.Status;
import org.eclipse.jdt.annotation.Nullable;
import org.eclipse.jface.dialogs.IDialogConstants;
import org.eclipse.swt.events.SelectionAdapter;
import org.eclipse.swt.events.SelectionEvent;
import org.eclipse.swt.widgets.Button;
import org.eclipse.swt.widgets.Composite;
import org.eclipse.swt.widgets.Shell;
import org.eclipse.swt.widgets.Tree;
import org.eclipse.swt.widgets.TreeItem;
import org.eclipse.ui.dialogs.ElementTreeSelectionDialog;
import org.eclipse.ui.dialogs.ISelectionStatusValidator;
import org.eclipse.ui.model.BaseWorkbenchContentProvider;
import org.eclipse.ui.model.WorkbenchLabelProvider;

/**
 * Dialog to select a project from the workspace, with the option to clone a new one.
 */
public class SelectProjectDialog extends ElementTreeSelectionDialog {
    
    /**
     * Validates that selection is exactly one project.
     */
    private static final ISelectionStatusValidator VALIDATOR = selection -> {
        if (selection.length == 1 && selection[0] instanceof IProject) {
            return new Status(IStatus.OK, Activator.PLUGIN_ID, "");
        } else {
            return new Status(IStatus.ERROR, Activator.PLUGIN_ID, "Select a project");
        }
    };
    
    /**
     * Create a project selection dialog.
     */
    public SelectProjectDialog(@Nullable Shell parent, IResource input) {
        super(parent, new WorkbenchLabelProvider(), new BaseWorkbenchContentProvider() {
            @Override public boolean hasChildren(@Nullable Object element) { return false; }
        });
        setInput(input);
        setValidator(VALIDATOR);
        setAllowMultiple(false);
        setTitle("Eclipseonut");
        setMessage("Select a project to collaborate on.");
    }
    
    @Override
    protected void createButtonsForButtonBar(Composite parent) {
        final Button clone = createButton(parent, IDialogConstants.CLIENT_ID, "Quick Clone", false);
        clone.addSelectionListener(new SelectionAdapter() {
            @Override public void widgetSelected(SelectionEvent e) {
                QuickCloneDialog dialog = new QuickCloneDialog(getShell());
                dialog.open(); // blocks
                getTreeViewer().refresh();
                try {
                    selectProject(dialog.getClonedProject());
                } catch (InterruptedException ie) {
                    // canceled
                }
            }
        });
        super.createButtonsForButtonBar(parent);
    }
    
    @Override
    protected void updateOKStatus() {
        // override to avoid using possibly-stale `fEmpty`
        updateStatus(VALIDATOR.validate(getResult()));
    }
    
    /**
     * Select the given project.
     */
    private void selectProject(IProject target) {
        Tree tree = getTreeViewer().getTree();
        for (TreeItem item : tree.getItems()) {
            if (item.getData().equals(target)) {
                tree.setEnabled(true);
                tree.setSelection(item);
                setResult(singletonList(target));
                updateOKStatus();
                getOkButton().setFocus();
                return;
            }
        }
    }
    
    /**
     * @return the selected project
     * @throws InterruptedException if the selection was canceled
     * @see #getResult()
     */
    public IProject getSelectedProject() throws InterruptedException {
        Object[] projects = getResult();
        if (projects == null) {
            throw new InterruptedException("Project selection canceled");
        }
        if (projects.length != 1) {
            throw new InterruptedException("Project selection invalid");
        }
        return assertNotNull((IProject)projects[0], "Project selection null");
    }
}
