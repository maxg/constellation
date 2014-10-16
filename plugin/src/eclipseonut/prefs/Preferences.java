package eclipseonut.prefs;

import static eclipseonut.prefs.Preferences.Key.*;
import static java.lang.Boolean.parseBoolean;
import static java.lang.Integer.parseInt;

import java.io.IOException;
import java.util.Properties;

import org.eclipse.core.runtime.preferences.AbstractPreferenceInitializer;
import org.eclipse.jface.preference.IPreferenceStore;

import eclipseonut.Activator;
import eclipseonut.Log;

/**
 * Plug-in preferences.
 */
public class Preferences extends AbstractPreferenceInitializer {
    
    public static enum Key {
        DEBUG, HTTP, WS, HOST, HTTP_PORT, WS_PORT;
        public final String key;
        Key() { key = name(); }
    }
    
    public void initializeDefaultPreferences() {
        IPreferenceStore store = Activator.getDefault().getPreferenceStore();
        Properties defaults = new Properties();
        try {
            defaults.load(getClass().getResourceAsStream("defaults.properties"));
        } catch (IOException ioe) {
            Log.warn("Error reading preferences defaults", ioe);
        }
        store.setDefault(DEBUG.key,     parseBoolean(defaults.getProperty(DEBUG.key, "false")));
        store.setDefault(HTTP.key,      defaults.getProperty(HTTP.key, "https"));
        store.setDefault(WS.key,        defaults.getProperty(WS.key, "wss"));
        store.setDefault(HOST.key,      defaults.getProperty(HOST.key, "eclipseonut"));
        store.setDefault(HTTP_PORT.key, parseInt(defaults.getProperty(HTTP_PORT.key, "443")));
        store.setDefault(WS_PORT.key,   parseInt(defaults.getProperty(WS_PORT.key, "444")));
    }
    
    public static String http() {
        IPreferenceStore store = Activator.getDefault().getPreferenceStore();
        return store.getString(HTTP.key) + "://" + store.getString(HOST.key) + ":" + store.getInt(HTTP_PORT.key);
    }
    
    public static String ws() {
        IPreferenceStore store = Activator.getDefault().getPreferenceStore();
        return store.getString(WS.key) + "://" + store.getString(HOST.key) + ":" + store.getInt(WS_PORT.key);
    }
}
