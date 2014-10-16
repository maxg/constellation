package eclipseonut;

import java.io.ByteArrayInputStream;
import java.io.InputStream;

import org.eclipse.compare.CompareConfiguration;
import org.eclipse.compare.CompareEditorInput;
import org.eclipse.compare.IStreamContentAccessor;
import org.eclipse.compare.ITypedElement;
import org.eclipse.compare.structuremergeviewer.Differencer;
import org.eclipse.core.resources.IFile;
import org.eclipse.core.runtime.CoreException;
import org.eclipse.core.runtime.IProgressMonitor;
import org.eclipse.jface.text.IDocument;
import org.eclipse.swt.SWT;
import org.eclipse.swt.graphics.Image;
import org.eclipse.swt.widgets.Composite;
import org.eclipse.swt.widgets.Control;
import org.eclipse.ui.PlatformUI;

public class ShareCompare extends CompareEditorInput {
    
    private final IFile file;
    private final IDocument local;
    private final String remote;
    private final Runnable ok, cancel;
    
    public ShareCompare(IFile file, IDocument local, String remote, Runnable ok, Runnable cancel) {
        super(new CompareConfiguration());
        this.file = file;
        this.local = local;
        this.remote = remote;
        this.ok = ok;
        this.cancel = cancel;
        CompareConfiguration conf = getCompareConfiguration();
        conf.setLeftLabel("Your local version");
        conf.setRightLabel("Collaborative version");
        setTitle("Cannot open " + file.getFullPath().toOSString());
        setDirty(true); // enable OK button
    }
    
    @Override protected Object prepareInput(IProgressMonitor monitor) {
        return new Differencer().findDifferences(false, monitor, null, null,
                new CompareItem(local.get()), new CompareItem(remote));
    }
    
    @Override public String getOKButtonLabel() {
        return "Replace local version";
    }
    
    @Override public void saveChanges(IProgressMonitor monitor) throws CoreException {
        PlatformUI.getWorkbench().getDisplay().asyncExec(ok);
    }
    
    @Override public void cancelPressed() {
        PlatformUI.getWorkbench().getDisplay().asyncExec(cancel);
    }
    
    @Override public Control createContents(Composite parent) {
        Control contents = super.createContents(parent);
        
        // closing the dialog with escape should be equivalent to pressing cancel
        parent.getShell().addListener(SWT.Traverse, event -> {
            if (event.detail == SWT.TRAVERSE_ESCAPE) {
                cancelPressed();
            }
        });
        
        return contents;
    }
    
    class CompareItem implements ITypedElement, IStreamContentAccessor {
        
        private final String content;
        
        public CompareItem(String content) {
            this.content = content;
        }

        public String getName() { return null; }

        public Image getImage() { return null; }

        public String getType() { return file.getFullPath().getFileExtension(); }

        public InputStream getContents() throws CoreException {
            return new ByteArrayInputStream(content.getBytes());
        }
    }
}
