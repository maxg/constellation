package eclipseonut;

import static eclipseonut.Util.assertNotNull;

import java.io.IOException;
import java.io.InputStreamReader;
import java.io.Reader;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;

import javax.script.Invocable;
import javax.script.ScriptContext;
import javax.script.ScriptEngine;
import javax.script.ScriptEngineManager;
import javax.script.ScriptException;

import org.eclipse.swt.widgets.Display;
import org.eclipse.ui.PlatformUI;

/**
 * JavaScript engine.
 */
public class JSEngine {
    
    private final ScriptEngine engine = assertNotNull(new ScriptEngineManager().getEngineByName("JavaScript"),
            "No JavaScript engine");
    private final InvocableEngine ie = new InvocableEngine();
    private final ScheduledExecutorService exec = Executors.newSingleThreadScheduledExecutor();
    
    /**
     * Initialize a JavaScript engine.
     */
    public JSEngine() throws ScriptException {
        Debug.trace();
        engine.put("JSEngineBindings", new JSEngineBindings());
        engine.eval(readScript("environment"));
    }
    
    private Reader readScript(String name) {
        return new InputStreamReader(getClass().getResourceAsStream("js/" + name + ".js"));
    }
    
    /**
     * Run a script, synchronously if on the UI thread or asynchronously on the UI thread otherwise.
     */
    public void execScript(String name) {
        exec(() -> {
            try {
                engine.eval(readScript(name));
            } catch (ScriptException se) {
                throw new RuntimeException(se);
            }
        });
    }
    
    /**
     * Run a script, synchronously if on the UI thread or asynchronously on the UI thread otherwise.
     */
    public void execScript(Reader in) throws IOException {
        exec(() -> {
            try {
                engine.eval(in);
            } catch (ScriptException se) {
                throw new RuntimeException(se);
            }
        });
    }
    
    /**
     * Run code, synchronously if on the UI thread or asynchronously on the UI thread otherwise.
     */
    public void exec(Task task) {
        exec(() -> {
            try {
                task.call(ie);
            } catch (RuntimeException re) {
                throw re;
            } catch (Exception e) {
                throw new RuntimeException(e);
            }
        });
    }
    
    private void exec(Runnable run) {
        if (Display.getCurrent() == null) {
            PlatformUI.getWorkbench().getDisplay().asyncExec(run);
        } else {
          run.run();
        }
    }
    
    /**
     * Run code after a delay, asynchronously on the UI thread.
     */
    public ScheduledFuture<?> schedule(Task task, int delay) {
        return exec.schedule(() -> exec(task), delay, TimeUnit.MILLISECONDS);
    }
    
    /**
     * Run code on an interval, asynchronously on the UI thread.
     */
    public ScheduledFuture<?> repeat(Task task, int interval) {
        return exec.scheduleAtFixedRate(() -> exec(task), interval, interval, TimeUnit.MILLISECONDS);
    }
    
    public void stop() {
        Debug.trace();
        exec.shutdown();
        engine.setBindings(engine.createBindings(), ScriptContext.ENGINE_SCOPE);
    }
    
    public class InvocableEngine {
        public final ScriptEngine engine = JSEngine.this.engine;
        public final Invocable invocable = (Invocable)engine;
    }
    
    @FunctionalInterface
    public static interface Task {
        public void call(InvocableEngine js) throws Exception;
    }
    
    public class JSEngineBindings {
        public ScheduledFuture<?> setTimeout(Runnable run, int delay) {
            return schedule(js -> run.run(), delay);
        }
        public ScheduledFuture<?> setInterval(Runnable run, int interval) {
            return repeat(js -> run.run(), interval);
        }
    }
}
