package constellation;

import static constellation.Util.assertNotNull;

import java.io.File;
import java.io.IOException;
import java.lang.reflect.InvocationTargetException;
import java.nio.file.Files;
import java.util.Optional;

import javax.xml.parsers.DocumentBuilderFactory;
import javax.xml.parsers.ParserConfigurationException;

import org.eclipse.core.filesystem.EFS;
import org.eclipse.core.filesystem.IFileInfo;
import org.eclipse.core.filesystem.IFileStore;
import org.eclipse.core.filesystem.IFileSystem;
import org.eclipse.core.resources.IProject;
import org.eclipse.core.resources.ResourcesPlugin;
import org.eclipse.core.runtime.CoreException;
import org.eclipse.core.runtime.IProgressMonitor;
import org.eclipse.core.runtime.Path;
import org.eclipse.core.runtime.SubMonitor;
import org.eclipse.jdt.annotation.Nullable;
import org.eclipse.jface.dialogs.IInputValidator;
import org.eclipse.jface.dialogs.InputDialog;
import org.eclipse.jface.dialogs.ProgressMonitorDialog;
import org.eclipse.jgit.api.Git;
import org.eclipse.jgit.api.errors.GitAPIException;
import org.eclipse.jgit.lib.Config;
import org.eclipse.swt.dnd.Clipboard;
import org.eclipse.swt.dnd.TextTransfer;
import org.eclipse.swt.widgets.Display;
import org.eclipse.swt.widgets.Shell;
import org.eclipse.ui.wizards.datatransfer.FileSystemStructureProvider;
import org.eclipse.ui.wizards.datatransfer.ImportOperation;
import org.w3c.dom.Document;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;
import org.xml.sax.SAXException;

/**
 * Dialog to clone a project into the workspace.
 */
public class QuickCloneDialog extends InputDialog {
    
    /**
     * Validates a Git remote URL.
     */
    private static final IInputValidator VALIDATOR = text -> {
        if ( ! (text.startsWith("http://") || text.startsWith("https://"))) {
            return "URL must start with 'http://' or 'https://'";
        }
        if ( ! text.endsWith(".git")) {
            return "URL must end with '.git'";
        }
        return null; // no error
    };
    
    /**
     * @return if the clipboard contains a valid remote URL, that URL; otherwise, empty string
     */
    private static String getURLFromClipboard() {
        Clipboard clipboard = new Clipboard(Display.getCurrent());
        String contents = (String)clipboard.getContents(TextTransfer.getInstance());
        if (contents != null) {
            String url = contents.trim();
            if (VALIDATOR.isValid(url) == null) { return url; }
        }
        return "";
    }
    
    private Optional<IProject> imported = Optional.empty();
    
    /**
     * Create a clone dialog.
     */
    public QuickCloneDialog(@Nullable Shell parent) {
        super(parent, "Clone a repository", "Remote URL to clone from:", getURLFromClipboard(), VALIDATOR);
    }
    
    @Override
    protected void okPressed() {
        try {
            imported = Optional.of(cloneAndImport(getValue().trim()));
            super.okPressed();
        } catch (IOException | InvocationTargetException e) {
            Activator.showErrorDialog(getShell(), "Error cloning and importing project", e);
        } catch (InterruptedException ie) {
            // canceled
        }
    }
    
    private IProject cloneAndImport(String remoteURL) throws IOException, InvocationTargetException, InterruptedException {
        File tempDir = Files.createTempDirectory("constellation-").toFile();
        try {
            new ProgressMonitorDialog(null).run(true, true, monitor -> cloneAndImport(remoteURL, tempDir, monitor));
            String projectName = getProjectName(tempDir);
            return ResourcesPlugin.getWorkspace().getRoot().getProject(projectName);
        } finally {
            recursiveDelete(tempDir);
        }
    }
    
    private void cloneAndImport(String remoteURL, File tempDir, @Nullable IProgressMonitor monitor) throws InvocationTargetException, InterruptedException {
        SubMonitor progress = SubMonitor.convert(monitor, "Clone and import", 3);
        try {
            clone(remoteURL, tempDir, progress.split(1));
            String projectName = getProjectName(tempDir);
            progress.worked(1);
            IProject target = ResourcesPlugin.getWorkspace().getRoot().getProject(projectName);
            if (target.exists()) {
                throw new RuntimeException("Workspace already contains a project named '" + projectName + "'");
            }
            ImportOperation importer = new ImportOperation(Path.fromOSString(projectName), tempDir, FileSystemStructureProvider.INSTANCE, null);
            importer.setCreateContainerStructure(false);
            importer.run(progress.split(1));
            // work around org.eclipse.core.filesystem.provider.FileInfo#setAttribute
            // which sets the immutable flag on read-only files
            recursiveUnlock(EFS.getLocalFileSystem(), target.getLocation().toFile());
        } catch (GitAPIException | IOException | CoreException e) {
            throw new InvocationTargetException(e);
        }
    }
    
    private void clone(String remoteURL, File tempDir, SubMonitor progress) throws GitAPIException {
        progress.setWorkRemaining(10);
        progress.subTask("Cloning repository");
        Git git = Git.cloneRepository().setURI(remoteURL).setDirectory(tempDir)
                .setNoCheckout(true)
                .setProgressMonitor(new JGitProgressMonitor(progress.split(6)))
                .call();
        // ensure newlines will not be converted
        Config config = git.getRepository().getConfig();
        if (config.getString("core", null, "autocrlf") != null) {
            config.setString("core", null, "autocrlf", "input");
        }
        // JGit clone-without-checkout doesn't set up default branch, assume master
        git.checkout().setName("master").setStartPoint("refs/remotes/origin/master")
                .setCreateBranch(true)
                .call();
        progress.worked(3);
        git.getRepository().close(); // git.close() alone keeps a pack file lock
        git.close();
        progress.worked(1);
    }
    
    private String getProjectName(File projectDir) throws IOException {
        File project = new File(projectDir, ".project");
        if ( ! project.exists()) {
            throw new IOException("Not a valid project, missing Eclipse '.project' file");
        }
        try {
            Document dom = DocumentBuilderFactory.newInstance().newDocumentBuilder().parse(project);
            Node projectDescription = dom.getFirstChild();
            NodeList children = projectDescription.getChildNodes();
            for (int ii = 0; ii < children.getLength(); ii++) {
                if (children.item(ii).getNodeName().equals("name")) {
                    return assertNotNull(children.item(ii).getTextContent(),
                            "Error parsing Eclipse '.project' name element");
                }
            }
        } catch (SAXException | ParserConfigurationException e) {
            throw new IOException("Error parsing Eclipse '.project' file", e);
        }
        throw new IOException("Invalid Eclipse '.project' file, could not find project name");
    }
    
    private void recursiveUnlock(IFileSystem filesystem, File file) throws CoreException {
        if ((filesystem.attributes() & EFS.ATTRIBUTE_IMMUTABLE) == 0) {
            return;
        }
        if ( ! file.exists()) { return; }
        if (file.isDirectory()) {
            for (File child : file.listFiles()) {
                recursiveUnlock(filesystem, child);
            }
        }
        IFileStore store = filesystem.fromLocalFile(file);
        IFileInfo info = store.fetchInfo();
        if (info.getAttribute(EFS.ATTRIBUTE_IMMUTABLE)) {
            info.setAttribute(EFS.ATTRIBUTE_IMMUTABLE, false);
            store.putInfo(info, EFS.SET_ATTRIBUTES, null);
        }
    }
    
    private void recursiveDelete(File file) {
        if ( ! file.exists()) { return; }
        if (file.isDirectory()) {
            for (File child : file.listFiles()) {
                recursiveDelete(child);
            }
        }
        file.delete();
    }
    
    /**
     * @return the cloned and imported project
     * @throws InterruptedException if a project was not cloned and imported
     * @see #getValue()
     */
    public IProject getClonedProject() throws InterruptedException {
        if ( ! imported.isPresent()) {
            throw new InterruptedException("Did not clone a project");
        }
        return imported.get();
    }
}
