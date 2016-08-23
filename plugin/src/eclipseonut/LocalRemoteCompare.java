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
import org.eclipse.jdt.annotation.Nullable;
import org.eclipse.jface.text.IDocument;
import org.eclipse.swt.SWT;
import org.eclipse.swt.graphics.Image;
import org.eclipse.swt.widgets.Composite;
import org.eclipse.swt.widgets.Control;
import org.eclipse.ui.PlatformUI;

public class LocalRemoteCompare extends CompareEditorInput {
    
    private static CompareConfiguration createCompareConfiguration() {
        CompareConfiguration conf = new CompareConfiguration();
        conf.setLeftLabel("Your local version");
        conf.setRightLabel("Collaborative version");
        return conf;
    }
    
    private final IFile file;
    private final IDocument local;
    private final String remote;
    private final Runnable ok, cancel;
    
    public LocalRemoteCompare(IFile file, IDocument local, String remote, Runnable ok, Runnable cancel) {
        super(createCompareConfiguration());
        Debug.trace(file);
        this.file = file;
        this.local = local;
        this.remote = remote;
        this.ok = ok;
        this.cancel = cancel;
        setTitle("Cannot open " + file.getFullPath().toOSString());
        setDirty(true); // enable OK button
    }
    
    @Override
    protected @Nullable Object prepareInput(@Nullable IProgressMonitor monitor) {
        return new Differencer().findDifferences(false, monitor, null, null,
                new CompareItem(local.get()), new CompareItem(remote));
    }
    
    @Override
    public String getOKButtonLabel() {
        return "Replace local version";
    }
    
    @Override
    public void saveChanges(@Nullable IProgressMonitor monitor) throws CoreException {
        PlatformUI.getWorkbench().getDisplay().asyncExec(ok);
    }
    
    @Override
    public void cancelPressed() {
        PlatformUI.getWorkbench().getDisplay().asyncExec(cancel);
    }
    
    @Override
    public Control createContents(Composite parent) {
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
        
        private final byte[] bytes;
        
        public CompareItem(String content) {
            Debug.trace();
            bytes = content.getBytes();
        }
        
        @Override public @Nullable String getName() { return null; }
        
        @Override public @Nullable Image getImage() { return null; }
        
        @Override public @Nullable String getType() {
            return file.getFullPath().getFileExtension();
        }
        
        @Override public InputStream getContents() {
            return new ByteArrayInputStream(bytes);
        }
    }
}
