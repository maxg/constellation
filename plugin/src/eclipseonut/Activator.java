package eclipseonut;

import org.eclipse.core.runtime.Platform;
import org.eclipse.jface.resource.ImageDescriptor;
import org.eclipse.ui.plugin.AbstractUIPlugin;
import org.osgi.framework.BundleContext;

import eclipseonut.prefs.Preferences;

public class Activator extends AbstractUIPlugin {

    public static final String PLUGIN_ID = "eclipseonut.plugin";

    private static Activator plugin;
    
    public static Activator getDefault() {
        return plugin;
    }

    public static ImageDescriptor getImageDescriptor(String path) {
        return imageDescriptorFromPlugin(PLUGIN_ID, path);
    }
    
    public static String getString(String subkey) {
        return Platform.getResourceString(getDefault().getBundle(), "%eclipseonut." + subkey);
    }
    
    public Activator() {
    }

    public void start(BundleContext context) throws Exception {
        super.start(context);
        plugin = this;
        
        if (Activator.getDefault().getPreferenceStore().getBoolean(Preferences.Key.DEBUG.key)) {
            Log.info("Debug: enabling insecure SSL");
            Debug.enableInsecureSSL();
        }
    }

    public void stop(BundleContext context) throws Exception {
        plugin = null;
        super.stop(context);
    }
}
