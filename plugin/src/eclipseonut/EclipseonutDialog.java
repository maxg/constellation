package eclipseonut;

import java.io.File;
import java.io.FileNotFoundException;
import java.io.IOException;
import java.lang.reflect.InvocationTargetException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

import javax.xml.parsers.DocumentBuilder;
import javax.xml.parsers.DocumentBuilderFactory;
import javax.xml.parsers.ParserConfigurationException;

import org.eclipse.core.resources.IProject;
import org.eclipse.core.runtime.IStatus;
import org.eclipse.core.runtime.Status;
import org.eclipse.core.runtime.SubMonitor;
import org.eclipse.jface.dialogs.IDialogConstants;
import org.eclipse.jface.dialogs.InputDialog;
import org.eclipse.jface.dialogs.MessageDialog;
import org.eclipse.jface.dialogs.ProgressMonitorDialog;
import org.eclipse.jface.viewers.TreeViewer;
import org.eclipse.jface.window.Window;
import org.eclipse.jgit.api.Git;
import org.eclipse.jgit.api.errors.GitAPIException;
import org.eclipse.jgit.api.errors.InvalidRemoteException;
import org.eclipse.jgit.api.errors.TransportException;
import org.eclipse.swt.SWT;
import org.eclipse.swt.dnd.Clipboard;
import org.eclipse.swt.dnd.TextTransfer;
import org.eclipse.swt.events.MouseEvent;
import org.eclipse.swt.events.MouseListener;
import org.eclipse.swt.events.TraverseEvent;
import org.eclipse.swt.events.TraverseListener;
import org.eclipse.swt.widgets.Button;
import org.eclipse.swt.widgets.Composite;
import org.eclipse.swt.widgets.Display;
import org.eclipse.swt.widgets.Shell;
import org.eclipse.swt.widgets.Tree;
import org.eclipse.swt.widgets.TreeItem;
import org.eclipse.ui.dialogs.ElementTreeSelectionDialog;
import org.eclipse.ui.dialogs.ISelectionStatusValidator;
import org.eclipse.ui.model.BaseWorkbenchContentProvider;
import org.eclipse.ui.model.WorkbenchLabelProvider;
import org.eclipse.ui.wizards.datatransfer.FileSystemStructureProvider;
import org.eclipse.ui.wizards.datatransfer.ImportOperation;
import org.w3c.dom.Document;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;
import org.xml.sax.SAXException;

/**
 * An extension of ElementTreeSelectionDialog designed to work for project selection to 
 * collaborate on. This extension is necessary for two reasons.
 *   1. ElementTreeSelectionDialog caches whether the input is originally empty, which 
 *      results in undesirable behavior when mutating the input.
 *   2. The "quick clone" functionality requires creating a new button for the button
 *      bar.
 */
public class EclipseonutDialog extends ElementTreeSelectionDialog {
    private static final String NONECLIPSE_ERROR_MESSAGE = "Cloned repository is missing a"
            + " .project file. To use it in Eclipse, clone it in a terminal then use the"
            + " import wizard.";
    private static final String NONGIT_ERROR_MESSAGE = "Repository URL must end with .git"
            + " and use http or https.";
    private static final String TEMP_DIR_PREFIX = "eclipseonut-";
    
    private final ISelectionStatusValidator validator =
            selection -> selection.length == 1 && selection[0] instanceof IProject
            ? new Status(IStatus.OK, Activator.PLUGIN_ID, "")
            : new Status(IStatus.ERROR, Activator.PLUGIN_ID, "Select a project"); 
    
    public EclipseonutDialog(Shell parent, Object input) {
        super(parent, new WorkbenchLabelProvider(), new BaseWorkbenchContentProvider() {
            @Override public boolean hasChildren(Object element) { return false; }
        });
        setInput(input);
        setValidator(validator);
        setAllowMultiple(false);
        setTitle("Eclipseonut for 6.005");
        setMessage("Select a project to collaborate on.");
    }
    
    private void cloneButtonDialog() {
        Clipboard clipboard = new Clipboard(Display.getCurrent());
        TextTransfer textTransfer = TextTransfer.getInstance();
        String contents = clipboard.getContents(textTransfer).toString().trim();
        String initial = "";
        if (checkGitString(contents)) {
            initial = contents;
        }

        InputDialog inputDialog = new InputDialog(getShell(), "Clone a Repository", "Input a remote URL to clone from.", initial, null);
        int returnCode = inputDialog.open();
        String result = inputDialog.getValue();
        // Check returnCode == OK instead of result != null, because returnCode correctly
        // recognizes the Esc key, whereas result does not.
        if (returnCode == Window.OK) {
            if (checkGitString(result)) {
                cloneAndImport(result);
            } else {
                error(NONGIT_ERROR_MESSAGE);
            }
        }
    }
    
    private boolean checkGitString(String uri) {
        return uri != null && uri.contains("://") && uri.endsWith(".git");
    }

    @Override
    protected void createButtonsForButtonBar(Composite parent) {
        Button clone = createButton(parent, IDialogConstants.NO_ID, "Quick Clone", false);
        clone.addMouseListener(new MouseListener() {
            @Override
            public void mouseUp(MouseEvent e) {
                cloneButtonDialog();
            }

            @Override
            public void mouseDown(MouseEvent e) {}

            @Override
            public void mouseDoubleClick(MouseEvent e) {}
        });
        clone.addTraverseListener(new TraverseListener() {
            @Override
            public void keyTraversed(TraverseEvent e) {
                if (e.detail == SWT.TRAVERSE_RETURN) {
                    cloneButtonDialog();
                }
            }
        });
        super.createButtonsForButtonBar(parent);
    }

    private void refreshProjects(String projectName) {
        TreeViewer treeViewer = getTreeViewer();
        treeViewer.refresh();
        
        Tree tree = treeViewer.getTree();
        TreeItem[] projects = tree.getItems();
        
        TreeItem newSelection = null;
        for (TreeItem project : projects) {
            if (!(project.getData() instanceof IProject)) {
                throw new IllegalArgumentException("Workspace Tree contains a non-project object.");
            }
            if (((IProject)project.getData()).getName().equals(projectName)) {
                newSelection = project;
                break;
            }
        }
        if (newSelection == null) {
            throw new RuntimeException("Project not correctly imported.");
        }
        tree.setEnabled(true);
        List<Object> sel = new ArrayList<>();
        sel.add(newSelection.getData());
        tree.setSelection(newSelection);
        setResult(sel);
        
        updateOKStatus();
        getOkButton().setFocus();
    }
    
    @Override
    protected void updateOKStatus() {
        updateStatus(validator.validate(getResult()));
    }
    
    /**
     * Clones a git repository and imports it into the workspace.
     * 
     * @param remoteURL
     * @return String containing the name of the imported project
     */
    private void cloneAndImport(String remoteURL) {
        // e.g. https://github.com/mit6005/fa15-ex26-music-language.git
        Path tempPath = null;
        try {
            tempPath = Files.createTempDirectory(TEMP_DIR_PREFIX);
        } catch (IOException ioe) {
            ioe.printStackTrace();
        }
        File tempFile = tempPath.toFile();
        try {
            new ProgressMonitorDialog(null).run(true, true, (monitor) -> {
                SubMonitor progress = SubMonitor.convert(monitor, "Clone and Import", 10);
                clone(remoteURL, tempFile, progress.newChild(5));
                String projectName = getProjectName(tempFile);
                
                ImportOperation importOp = new ImportOperation(org.eclipse.core.runtime.Path.fromOSString(projectName),
                        tempFile, FileSystemStructureProvider.INSTANCE, null);
                importOp.setCreateContainerStructure(false);
                importOp.run(progress.newChild(5));
            });
        } catch (InvocationTargetException ite) {
            ite.printStackTrace();
        } catch (InterruptedException ie) {
            ie.printStackTrace();
        }
        String projectName = getProjectName(tempFile);
        refreshProjects(projectName);
        deleteDirectory(tempFile);
    }
    
    private void clone(String remoteURL, File tempFile, SubMonitor progress) {
        progress.setWorkRemaining(1);
        progress.subTask("Cloning repository.");
        try {
            Git git = Git.cloneRepository().setURI(remoteURL).setDirectory(tempFile).call();
            // Although the jgit documentation suggests that git.close() should close
            // the repository, it allows the repository to hold a lock on a pack file.
            git.getRepository().close();
            git.close();
        } catch (InvalidRemoteException ire) {
            ire.printStackTrace();
        } catch (TransportException te) {
            te.printStackTrace();
        } catch (GitAPIException gae) {
            gae.printStackTrace();
        }
        progress.worked(1);
}
    

    
    /**
     * Delete the input file, recursively traversing the directory structure as needed
     * for directories.
     * @param directory File to be deleted. If it is not a directory, will be deleted anyway.
     */
    private void deleteDirectory(File directory) {
        File[] files = directory.listFiles();
        if (files != null) {
            // if files is null, directory is a file so no recursion happens
            for (File child : files) {
                if (child.isDirectory()) {
                    deleteDirectory(child);
                } else {
                    child.delete();
                }
            }
        }
        directory.delete();
    }
    
    /**
     * Given a directory which contains an Eclipse project (i.e. has a .project
     * file in the directory), returns its project name.
     * If the directory is missing the .project file, opens an error dialog.
     * @param projectDir
     * @return
     */
    private String getProjectName(File projectDir) {
        File project = new File(projectDir, ".project");
        if (!project.exists()) {
            error(NONECLIPSE_ERROR_MESSAGE);
            deleteDirectory(projectDir);
            throw new IllegalArgumentException("Git URL yielded a non-eclipse repo");
        }
        String projectName = "";
        DocumentBuilderFactory dbf = DocumentBuilderFactory.newInstance();
        try {
            DocumentBuilder db = dbf.newDocumentBuilder();
            Document dom = db.parse(project);
            Node projectDescription = dom.getFirstChild();
            NodeList children = projectDescription.getChildNodes();
            for (int i = 0; i < children.getLength(); i++) {
                Node n = children.item(i);
                if (n.getNodeName().equals("name")) {
                    projectName = n.getTextContent();
                    break;
                }
            }
        } catch (ParserConfigurationException pce) {
            pce.printStackTrace();
        } catch (FileNotFoundException fnfe) {
            fnfe.printStackTrace();
        } catch (SAXException saxe) {
            saxe.printStackTrace();
        } catch (IOException ioe) {
            ioe.printStackTrace();
        }
        return projectName;
    }
    
    private void error(String message) {
        MessageDialog dialog = new MessageDialog(this.getShell(), "Error", null, message,
                MessageDialog.ERROR, new String[] {"OK"}, 0);
        dialog.open();
    }
}