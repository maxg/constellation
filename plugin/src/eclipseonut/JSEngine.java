package eclipseonut;

import java.io.InputStreamReader;
import java.io.Reader;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;

import javax.script.Bindings;
import javax.script.ScriptEngine;
import javax.script.ScriptEngineManager;
import javax.script.ScriptException;
import javax.script.SimpleBindings;

import org.eclipse.swt.widgets.Display;
import org.eclipse.ui.PlatformUI;

public class JSEngine {
    
    private final ScriptEngine engine = new ScriptEngineManager().getEngineByName("JavaScript");
    private final ScheduledExecutorService exec = Executors.newSingleThreadScheduledExecutor();
    
    public JSEngine() throws ScriptException {
        engine.put("TIMERS", new Timers());
        engine.eval(readScript("environment"));
    }
    
    private final Reader readScript(String name) {
        return new InputStreamReader(this.getClass().getResourceAsStream("js/" + name + ".js"));
    }
    
    /**
     * Run a script from the `js` directory.
     * Evaluated sync'ly if on the UI thread, or async'ly on the UI thread otherwise.
     */
    public void execScript(String script) {
        exec(() -> {
            try {
                engine.eval(readScript(script));
            } catch (ScriptException se) {
                throw new RuntimeException(se);
            }
        });
    }
    
    /**
     * Run code.
     * Evaluated sync'ly if on the UI thread, or async'ly on the UI thread otherwise.
     */
    public void exec(Task task) {
        exec(() -> {
            try {
                task.call(engine);
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
     * Run code after a delay.
     * Evaluated async'ly on the UI thread.
     */
    public ScheduledFuture<?> schedule(Task task, int delay) {
        return exec.schedule(() -> exec(task), delay, TimeUnit.MILLISECONDS);
    }
    
    public ScheduledFuture<?> repeat(Task task, int interval) {
        return exec.scheduleAtFixedRate(() -> exec(task), interval, interval, TimeUnit.MILLISECONDS);
    }
    
    public class Timers {
        public ScheduledFuture<?> setTimeout(Object callback, int delay, Object arguments) {
            Bindings env = new SimpleBindings();
            env.put("fn", callback);
            env.put("args", arguments);
            return schedule(engine -> engine.eval("fn.apply(null, args)", env), delay);
        }
        
        public void clearTimeout(ScheduledFuture<?> future) {
            future.cancel(false);
        }
        
        public ScheduledFuture<?> setInterval(Object callback, int delay, Object arguments) {
            Bindings env = new SimpleBindings();
            env.put("fn", callback);
            env.put("args", arguments);
            return repeat(engine -> engine.eval("fn.apply(null, args)", env), delay);
        }
        
        public void clearInterval(ScheduledFuture<?> future) {
            future.cancel(false);
        }
    }
    
    @FunctionalInterface
    public static interface Task {
        public void call(ScriptEngine engine) throws Exception;
    }
}
