package eclipseonut;

import org.eclipse.core.runtime.Status;
import org.eclipse.jdt.annotation.Nullable;

public class Log {
    
    public static void ok(String msg) {
        log(Status.OK, msg, null);
    }
    
    public static void info(String msg) {
        info(msg, null);
    }
    
    public static void info(String msg, @Nullable Throwable ex) {
        log(Status.INFO, msg, ex);
    }
    
    public static void warn(String msg) {
        warn(msg, null);
    }
    
    public static void warn(String msg, @Nullable Throwable ex) {
        log(Status.WARNING, msg, ex);
    }
    
    public static void error(String msg) {
        error(msg, null);
    }
    
    public static void error(String msg, @Nullable Throwable ex) {
        log(Status.ERROR, msg, ex);
    }
    
    private static void log(int severity, String msg, @Nullable Throwable ex) {
        Activator.getDefault().getLog().log(new Status(severity, Activator.PLUGIN_ID, Status.OK, msg, ex));
    }
}
