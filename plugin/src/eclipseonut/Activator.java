package eclipseonut;

import static eclipseonut.Util.assertNotNull;

import java.io.ByteArrayOutputStream;
import java.io.PrintWriter;
import java.lang.reflect.InvocationTargetException;
import java.util.Arrays;
import java.util.concurrent.ExecutionException;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import org.eclipse.core.runtime.IStatus;
import org.eclipse.core.runtime.MultiStatus;
import org.eclipse.core.runtime.Platform;
import org.eclipse.core.runtime.Status;
import org.eclipse.jdt.annotation.Nullable;
import org.eclipse.jface.dialogs.ErrorDialog;
import org.eclipse.jface.resource.ImageDescriptor;
import org.eclipse.swt.widgets.Shell;
import org.eclipse.ui.PlatformUI;
import org.eclipse.ui.plugin.AbstractUIPlugin;
import org.osgi.framework.Bundle;
import org.osgi.framework.BundleContext;

import eclipseonut.prefs.Preferences;

public class Activator extends AbstractUIPlugin {
    
    public static final String PLUGIN_ID = "eclipseonut.plugin";
    
    private static @Nullable Activator plugin;
    
    public static Activator getDefault() {
        return assertNotNull(plugin, "Plug-in activator singleton missing");
    }
    
    public static String getString(String key) {
        return Platform.getResourceString(getDefault().bundle(), "%" + key);
    }
    
    public static <T> T getService(Class<T> api) {
        return assertNotNull(PlatformUI.getWorkbench().getService(api),
                "Workbench service '" + api + "' missing");
    }
    
    public static ImageDescriptor getIcon(String name) {
        return assertNotNull(imageDescriptorFromPlugin(PLUGIN_ID, "icons/" + name + ".png"),
                "Plug-in icon '" + name + "' missing");
    }
    
    public static boolean debug() {
        return getDefault().getPreferenceStore().getBoolean(Preferences.Key.DEBUG.key);
    }
    
    public static void showErrorDialog(@Nullable Shell parent, String message, Throwable error) {
        Log.info("Error dialog: " + message, error);
        
        // show exception messages in the dialog...
        String causes = causes(error)
                .filter(t -> t.getMessage() != null && ! isWrapper(t))
                .map(t -> t.getMessage())
                .collect(Collectors.joining("\n"));
        // ... and jam the stack trace into the details
        ByteArrayOutputStream buffer = new ByteArrayOutputStream();
        error.printStackTrace(new PrintWriter(buffer, true));
        IStatus[] children = Arrays.stream(buffer.toString().split("\n")).map(line -> {
            return new Status(IStatus.ERROR, PLUGIN_ID, line);
        }).toArray(IStatus[]::new);
        IStatus status = new MultiStatus(PLUGIN_ID, 0, children, message + ":\n" + causes, error);
        
        ErrorDialog.openError(parent, "Eclipseonut Error", null, status);
    }
    
    private static Stream<Throwable> causes(@Nullable Throwable error) {
        Stream.Builder<Throwable> builder = Stream.builder();
        for ( ; error != null; error = error.getCause()) {
            builder.add(error);
        }
        return builder.build();
    }
    
    private static boolean isWrapper(Throwable error) {
        return (error instanceof InvocationTargetException || error instanceof ExecutionException)
                && error.getCause() != null;
    }
    
    public Activator() { }
    
    public Bundle bundle() {
        return assertNotNull(getBundle(), "Plug-in bundle missing");
    }
    
    @Override
    public void start(BundleContext context) throws Exception {
        super.start(context);
        plugin = this;
        
        if (debug()) { Debug.enableInsecureSSL(); }
    }
    
    @Override
    public void stop(BundleContext context) throws Exception {
        plugin = null;
        super.stop(context);
    }
}
