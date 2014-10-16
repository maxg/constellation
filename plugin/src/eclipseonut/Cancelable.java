package eclipseonut;

import java.util.LinkedList;
import java.util.List;
import java.util.concurrent.*;

import org.eclipse.core.runtime.SubMonitor;

/**
 * A task that may be canceled via progress monitor.
 */
public class Cancelable<V> {
    
    private final CompletionService<V> complete = new ExecutorCompletionService<>(Executors.newCachedThreadPool());
    private final List<Future<V>> futures = new LinkedList<>();
    
    /**
     * Start a new cancelable task.
     */
    public Cancelable(SubMonitor progress, Callable<V> task) {
        futures.add(complete.submit(task));
        futures.add(complete.submit(() -> {
           while (true) {
               Thread.sleep(500); // unfortunately, we must poll for cancellation
               if (progress.isCanceled()) { break; }
           }
           throw new CancellationException();
        }));
    }
    
    /**
     * Wait for the task to return a result or be canceled.
     * @return task result
     * @throws InterruptedException if canceled
     */
    public V get() throws InterruptedException, ExecutionException {
        try {
            return complete.take().get();
        } catch (ExecutionException ee) {
            if (ee.getCause() instanceof CancellationException) {
                throw new InterruptedException();
            }
            throw ee;
        } finally {
            futures.forEach(f -> f.cancel(true));
        }
    }
}
