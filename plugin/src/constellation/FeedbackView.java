package constellation;

import static constellation.Util.assertNotNull;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.MalformedURLException;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import java.util.stream.Collectors;

import org.eclipse.jdt.annotation.Nullable;
import org.eclipse.swt.SWT;
import org.eclipse.swt.browser.Browser;
import org.eclipse.swt.browser.BrowserFunction;
import org.eclipse.swt.browser.LocationListener;
import org.eclipse.swt.layout.FillLayout;
import org.eclipse.swt.widgets.Composite;
import org.eclipse.ui.PartInitException;
import org.eclipse.ui.part.ViewPart;

import constellation.prefs.Preferences;

public class FeedbackView extends ViewPart {
    
    private static final String BROWSE = "browse:";
    
    private final String page;
    private final Map<String,String> feedbackJSON = new HashMap<>();
    
    private @Nullable Browser browser;
    
    public FeedbackView() throws IOException {
        final InputStream stream = getClass().getResourceAsStream("js/feedback.html");
        page = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))
                .lines()
                .collect(Collectors.joining("\n"))
                .replaceAll("%http%", Preferences.http());
    }
    
    public void add(String id, String json) {
        feedbackJSON.put(id, json);
        update();
    }
    
    public void addAll(Collaboration collaboration) {
        collaboration.jse.exec(js -> {
            js.invocable.invokeFunction("feedback", feedbackJSON);
            update();
        });
    }
    
    private void update() {
        assertNotNull(browser, "Feedback view not initialized").setText(page);
    }
    
    @Override
    public void createPartControl(Composite parent) {
        parent.setLayout(new FillLayout());
        
        final Browser browser = new Browser(parent, SWT.NONE);
        browser.addLocationListener(LocationListener.changingAdapter(event -> {
            if ( ! event.location.startsWith(BROWSE)) { return; }
            try {
                Collaboration.browse(event.location.substring(BROWSE.length()));
            } catch (PartInitException | MalformedURLException e) {
                Activator.showErrorDialog(null, "Error opening page", e);
            }
            event.doit = false;
        }));
        browser.addMenuDetectListener(event -> event.doit = false);
        
        new BrowserFunction(browser, "getFeedback") {
            @Override public @Nullable Object[] function(@Nullable Object[] arguments) {
                return feedbackJSON.values().toArray();
            }
        };
        
        this.browser = browser;
    }
    
    @Override
    public void setFocus() {
        assertNotNull(browser, "Feedback view not initialized").setFocus();
    }
}
