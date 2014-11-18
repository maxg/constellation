package eclipseonut;

import org.eclipse.core.runtime.Status;

public class Log {
    
    public static void ok(String msg) {
        log(Status.OK, msg, null);
    }
    
    public static void info(String msg) {
        log(Status.INFO, msg, null);
    }
    
    public static void warn(String msg) {
        warn(msg, null);
    }
    
    public static void warn(String msg, Throwable ex) {
        log(Status.WARNING, msg, ex);
    }
    
    public static void error(String msg) {
        error(msg, null);
    }
    
    public static void error(String msg, Throwable ex) {
        log(Status.ERROR, msg, ex);
    }
    
    private static void log(int severity, String msg, Throwable ex) {
        Activator.getDefault().getLog().log(new Status(severity, Activator.PLUGIN_ID, Status.OK, msg, ex));
    }
}
