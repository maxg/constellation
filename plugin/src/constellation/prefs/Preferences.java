package constellation.prefs;

import static constellation.prefs.Preferences.Key.DEBUG;
import static constellation.prefs.Preferences.Key.HOST;
import static constellation.prefs.Preferences.Key.HTTP_PORT;
import static constellation.prefs.Preferences.Key.WS_PORT;
import static java.lang.Boolean.parseBoolean;
import static java.lang.Integer.parseInt;

import java.io.IOException;
import java.util.Properties;

import org.eclipse.core.runtime.preferences.AbstractPreferenceInitializer;
import org.eclipse.jface.preference.IPreferenceStore;

import constellation.Activator;
import constellation.Log;

/**
 * Plug-in preferences.
 */
public class Preferences extends AbstractPreferenceInitializer {
    
    public static enum Key {
        DEBUG, HOST, HTTP_PORT, WS_PORT;
        public final String key;
        Key() { key = name(); }
    }
    
    @Override
    public void initializeDefaultPreferences() {
        IPreferenceStore store = Activator.getDefault().getPreferenceStore();
        Properties defaults = new Properties();
        try {
            defaults.load(getClass().getResourceAsStream("defaults.properties"));
        } catch (IOException ioe) {
            Log.warn("Error reading preferences defaults", ioe);
        }
        store.setDefault(DEBUG.key,     parseBoolean(defaults.getProperty(DEBUG.key, "false")));
        store.setDefault(HOST.key,      defaults.getProperty(HOST.key, "constellation"));
        store.setDefault(HTTP_PORT.key, parseInt(defaults.getProperty(HTTP_PORT.key, "443")));
        store.setDefault(WS_PORT.key,   parseInt(defaults.getProperty(WS_PORT.key, "444")));
    }
    
    public static String http() {
        IPreferenceStore store = Activator.getDefault().getPreferenceStore();
        return "https://" + store.getString(HOST.key) + ":" + store.getInt(HTTP_PORT.key);
    }
    
    public static String ws() {
        IPreferenceStore store = Activator.getDefault().getPreferenceStore();
        return "wss://" + store.getString(HOST.key) + ":" + store.getInt(WS_PORT.key);
    }
}
