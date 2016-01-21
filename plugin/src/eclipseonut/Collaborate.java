package eclipseonut;

import java.io.File;
import java.io.FileNotFoundException;
import java.io.IOException;
import java.lang.reflect.InvocationTargetException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.Optional;

import javax.xml.parsers.DocumentBuilder;
import javax.xml.parsers.DocumentBuilderFactory;
import javax.xml.parsers.ParserConfigurationException;

import org.eclipse.core.commands.AbstractHandler;
import org.eclipse.core.commands.ExecutionEvent;
import org.eclipse.core.commands.ExecutionException;
import org.eclipse.core.resources.IProject;
import org.eclipse.core.resources.IWorkspaceRoot;
import org.eclipse.core.resources.ResourcesPlugin;
import org.eclipse.core.runtime.Assert;
import org.eclipse.core.runtime.IProgressMonitor;
import org.eclipse.core.runtime.IStatus;
import org.eclipse.core.runtime.Status;
import org.eclipse.core.runtime.SubMonitor;
import org.eclipse.jface.dialogs.IDialogConstants;
import org.eclipse.jface.dialogs.InputDialog;
import org.eclipse.jface.dialogs.MessageDialog;
import org.eclipse.jface.dialogs.ProgressMonitorDialog;
import org.eclipse.jface.viewers.ILabelProvider;
import org.eclipse.jface.viewers.ITreeContentProvider;
import org.eclipse.jface.viewers.TreeViewer;
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
import org.eclipse.swt.widgets.TreeItem;
import org.eclipse.ui.PlatformUI;
import org.eclipse.ui.commands.ICommandService;
import org.eclipse.ui.commands.IElementUpdater;
import org.eclipse.ui.dialogs.ElementTreeSelectionDialog;
import org.eclipse.ui.menus.UIElement;
import org.eclipse.ui.model.BaseWorkbenchContentProvider;
import org.eclipse.ui.model.WorkbenchLabelProvider;
import org.eclipse.ui.wizards.datatransfer.FileSystemStructureProvider;
import org.eclipse.ui.wizards.datatransfer.ImportOperation;
import org.w3c.dom.Document;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;
import org.xml.sax.SAXException;

import eclipseonut.ShareJS.Settings;

/**
 * Handles collaboration commands from the UI.
 */
public class Collaborate extends AbstractHandler implements IElementUpdater {
    
    private static final String COMMAND = "eclipseonut.command.collaborate";
    
    private final ICommandService service = (ICommandService)Activator.getDefault().getWorkbench().getService(ICommandService.class);
    private Optional<Collaboration> collab = Optional.empty();
    
    private class EclipseonutDialog extends ElementTreeSelectionDialog {
        public EclipseonutDialog(Shell parent, ILabelProvider labelProvider, ITreeContentProvider contentProvider) {
            super(parent, labelProvider, contentProvider);
        }
        
        private void cloneButtonAction() {
            Clipboard clippy = new Clipboard(Display.getCurrent());
            TextTransfer textTransfer = TextTransfer.getInstance();
            String initial = "";
            if (clippy.getContents(textTransfer) != null) {
                String clip = clippy.getContents(textTransfer).toString();
                if (clip.startsWith("http") && clip.endsWith(".git")) {
                    initial = clip;
                }
            }
            
            InputDialog inputDialog = new InputDialog(getShell(), "Clone a Repository", "Input a remote URL to clone from.", initial, null);
            inputDialog.open();
            String result = inputDialog.getValue();
            if (result != null) {
                String projectName = cloneAndImport(result, this);
                refreshProjects(projectName);
            }
        }

        @Override
        protected void createButtonsForButtonBar(Composite parent) {
            Button clone = createButton(parent, IDialogConstants.NO_ID, "Clone New", false);
            clone.addMouseListener(new MouseListener() {
                @Override
                public void mouseUp(MouseEvent e) {
                    cloneButtonAction();
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
                        cloneButtonAction();
                    }
                }
            });
            super.createButtonsForButtonBar(parent);
        }
        
        private void refreshProjects(String projectName) {
            TreeViewer treeViewer = getTreeViewer();
            treeViewer.refresh();
            TreeItem[] projects = treeViewer.getTree().getItems();
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
            treeViewer.getTree().setSelection(newSelection);
        }
    }
    
    public Object execute(ExecutionEvent event) throws ExecutionException {
        // TODO: handle disconnects => dialog box, possible red button
        // TODO: halt the server or something more clever
        // Perhaps drop a hook to the websocket and just close it
        // and figure out how to respond
        // Think about closing laptops and reopening in class
        // TODO: visibility that Collaboration is happening
        
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
        
        EclipseonutDialog dialog = new EclipseonutDialog(shell, new WorkbenchLabelProvider(), new BaseWorkbenchContentProvider() {
            @Override public boolean hasChildren(Object element) { return false; }
        });
        dialog.setInput(root);
        dialog.setValidator(selection -> selection.length == 1 && selection[0] instanceof IProject
                ? new Status(IStatus.OK, Activator.PLUGIN_ID, "")
                : new Status(IStatus.ERROR, Activator.PLUGIN_ID, "Select a project"));
        dialog.setAllowMultiple(false);
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
        } catch (InterruptedException ie) {
            throw ie;
        } catch (Exception e) {
            throw new InvocationTargetException(e, e.getMessage());
        }
    }
    
    /**
     * Clones a git repository and imports it into the workspace.
     * 
     * @param remoteURL
     * @param dialog
     * @return String containing the name of the imported project
     */
    private String cloneAndImport(String remoteURL, EclipseonutDialog dialog) {
        // e.g. https://github.com/mit6005/fa15-ex26-music-language.git
        Path tempPath = null;
        try {
            tempPath = Files.createTempDirectory(null);
            System.out.println(tempPath);
        } catch (IOException ioe) {
            ioe.printStackTrace();
        }
        File tempFile = tempPath.toFile();
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
        
        String projectName = getProjectName(tempFile);
        ImportOperation importOp = new ImportOperation(org.eclipse.core.runtime.Path.fromOSString(projectName), 
                tempFile, FileSystemStructureProvider.INSTANCE, null);
        importOp.setCreateContainerStructure(false);
        try {
            new ProgressMonitorDialog(null).run(true, true, (monitor) -> {
                importOp.run(monitor);
            });
        } catch (InvocationTargetException ite) {
            ite.printStackTrace();
        } catch (InterruptedException ie) {
            ie.printStackTrace();
        }
        deleteDirectory(tempFile);
        return projectName;
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
     * @param projectDir
     * @return
     */
    private String getProjectName(File projectDir) {
        File project = new File(projectDir, ".project");
        if (!project.exists()) {
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
}
