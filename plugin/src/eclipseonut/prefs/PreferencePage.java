package eclipseonut.prefs;

import static eclipseonut.prefs.Preferences.Key.HOST;
import static eclipseonut.prefs.Preferences.Key.HTTP_PORT;
import static eclipseonut.prefs.Preferences.Key.WS;
import static eclipseonut.prefs.Preferences.Key.WS_PORT;

import org.eclipse.jface.preference.ComboFieldEditor;
import org.eclipse.jface.preference.FieldEditorPreferencePage;
import org.eclipse.jface.preference.IntegerFieldEditor;
import org.eclipse.jface.preference.StringFieldEditor;
import org.eclipse.ui.IWorkbench;
import org.eclipse.ui.IWorkbenchPreferencePage;

import eclipseonut.Activator;

/**
 * Preferences GUI.
 */
public class PreferencePage extends FieldEditorPreferencePage implements IWorkbenchPreferencePage {
    
    public PreferencePage() {
        super(GRID);
        setPreferenceStore(Activator.getDefault().getPreferenceStore());
        setDescription("Eclipseonut connection preferences");
    }
    
    public void createFieldEditors() {
        addField(new ComboFieldEditor(Preferences.Key.HTTP.key, "HTTP protocol",
                new String[][] { { "HTTP", "http" }, { "HTTPS", "https" } },
                getFieldEditorParent()));
        addField(new ComboFieldEditor(WS.key, "WebSocket protocol",
                new String[][] { { "WS", "ws" }, { "WSS", "wss" } },
                getFieldEditorParent()));
        addField(new StringFieldEditor(HOST.key, "Host", getFieldEditorParent()));
        addField(new IntegerFieldEditor(HTTP_PORT.key, "HTTP port", getFieldEditorParent()));
        addField(new IntegerFieldEditor(WS_PORT.key, "WebSocket port", getFieldEditorParent()));
    }
    
    public void init(IWorkbench workbench) {
    }
}
