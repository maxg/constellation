package constellation;

import org.eclipse.core.runtime.SubMonitor;
import org.eclipse.jdt.annotation.Nullable;
import org.eclipse.jgit.lib.ProgressMonitor;

/**
 * Wraps a {@link SubMonitor} as a JGit {@link ProgressMonitor}.
 */
public class JGitProgressMonitor implements ProgressMonitor {
    
    private final SubMonitor monitor;
    
    public JGitProgressMonitor(SubMonitor monitor) {
        this.monitor = monitor;
    }

    @Override
    public void start(int totalTasks) {
        Debug.trace(totalTasks);
        monitor.setWorkRemaining(totalTasks);
    }
    
    @Override
    public void beginTask(@Nullable String title, int totalWork) {
        Debug.trace(title);
        monitor.subTask(title);
    }
    
    @Override
    public void update(int completed) { }
    
    @Override
    public void endTask() {
        monitor.worked(1);
    }
    
    @Override
    public boolean isCancelled() {
        return monitor.isCanceled();
    }
}
