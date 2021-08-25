package constellation;

import static constellation.CollaborationState.CONNECTED;
import static constellation.CollaborationState.CONNECTING;
import static constellation.CollaborationState.DISCONNECTED;
import static constellation.CollaborationState.RECONNECTING;
import static constellation.Util.assertNotNull;

import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.MalformedURLException;
import java.net.URI;
import java.net.URL;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Future;
import java.util.function.BiConsumer;

import org.eclipse.compare.CompareUI;
import org.eclipse.core.resources.IFile;
import org.eclipse.core.resources.IProject;
import org.eclipse.core.resources.ResourcesPlugin;
import org.eclipse.core.runtime.SubMonitor;
import org.eclipse.jetty.util.UrlEncoded;
import org.eclipse.jetty.util.ajax.JSON;
import org.eclipse.jface.text.IDocument;
import org.eclipse.ui.IWorkbenchPage;
import org.eclipse.ui.PartInitException;
import org.eclipse.ui.PlatformUI;
import org.eclipse.ui.texteditor.ITextEditor;
import org.osgi.framework.Version;

import constellation.prefs.Preferences;

public class Collaboration {
    
    private static final String SETUP_PROJECT = "constellation-setup";
    private static final String FEEDBACK = "constellation.view.feedback";
    
    public static void test(SubMonitor progress)
            throws InterruptedException, ExecutionException, IOException, PartInitException {
        progress.setWorkRemaining(1);
        IProject project = ResourcesPlugin.getWorkspace().getRoot().getProject(SETUP_PROJECT);
        Map<String,String> settings = pair(project, progress.split(1));
        if ( ! settings.containsKey("me")) {
            throw new IOException("Authentication failed");
        }
    }
    
    public static Collaboration connect(IProject project, CollaborationListener listener, SubMonitor progress)
            throws InterruptedException, ExecutionException, IOException, PartInitException {
        progress.setWorkRemaining(2);
        Map<String,String> settings = pair(project, progress.split(1));
        return new Collaboration(project, settings, listener, progress.split(1));
    }
    
    private static Map<String,String> pair(IProject project, SubMonitor progress)
            throws InterruptedException, ExecutionException, IOException, PartInitException {
        progress.setWorkRemaining(3);
        
        progress.subTask("Authenticating");
        Version version = Activator.getDefault().bundle().getVersion();
        Map<String, String> metadata = new Cancelable<>(progress, () -> get("/hello/eclipse/" + version)).get();
        
        if (metadata.containsKey("update")) {
            browse("/update/eclipse/" + version);
            throw new IOException("Please update to the latest version of Constellation");
        }
        
        String userid = metadata.get("userid");
        progress.worked(1);
        
        String projectName = UrlEncoded.encodeString(project.getName());
        browse("/pair/" + projectName + "/" + userid);
        progress.worked(1);
        
        progress.subTask("Waiting for pair...");
        Map<String, String> settings = new Cancelable<>(progress, () -> get("/await-collaboration/" + userid)).get();
        progress.worked(1);
        
        return settings;
    }
    
    @SuppressWarnings("unchecked")
    private static Map<String, String> get(String path) throws IOException {
        URL url = new URL(Preferences.http() + path);
        return assertNotNull((Map<String, String>)JSON.parse(new InputStreamReader(url.openStream())),
                "Error parsing JSON");
    }
    
    public static void browse(String path) throws MalformedURLException, PartInitException {
        URL url = new URL(Preferences.http() + path);
        PlatformUI.getWorkbench().getBrowserSupport().getExternalBrowser().openURL(url);
    }
    
    public final IProject project;
    public final String collabid;
    public final String me, partner;
    public final JSEngine jse;
    public final JSWebSocket socket;
    
    private CollaborationState state = CONNECTING;
    private final CollaborationListener listener;
    private final EditorManager manager;
    
    private Collaboration(IProject project, Map<String, String> settings, CollaborationListener listener, SubMonitor progress)
            throws IOException, InterruptedException, ExecutionException {
        Debug.trace();
        progress.setWorkRemaining(4);
        
        this.project = project;
        this.collabid = settings.get("collabid");
        this.me = settings.get("me");
        this.partner = settings.get("partner");
        try {
            jse = new JSEngine();
            socket = new JSWebSocket(jse, new URI(Preferences.ws() + "/" + settings.get("token")));
        } catch (Exception e) {
            throw new IOException(e);
        }
        this.listener = listener;
        this.manager = new EditorManager(this);
        
        progress.subTask("Setting up");
        InputStream script = new Cancelable<>(progress, () -> {
            return new URL(Preferences.http() + "/public/sharedb.js").openStream();
        }).get();
        progress.worked(1);
        jse.execScript(new InputStreamReader(script));
        progress.worked(1);
        
        jse.exec(js -> js.engine.put("CollaborationInstance", this));
        jse.execScript("sharedb");
        progress.worked(1);
        
        progress.subTask("Connecting");
        jse.exec(js -> socket.connect());
        progress.worked(1);
    }
    
    public CollaborationState state() {
        return state;
    }
    
    public void onConnectionState(String newState, String reason) {
        Debug.trace(newState, reason);
        switch (newState) {
        case "connected":
            state = CONNECTED; break;
        case "disconnected":
            state = RECONNECTING; break;
        case "closed":
        case "stopped":
            state = DISCONNECTED; break;
        default:
            return;
        }
        listener.onCollaborationState();
    }
    
    public void start() {
        Debug.trace();
        manager.start();
    }
    
    public void stop() {
        Debug.trace();
        manager.stop();
        Runnable callback = jse::stop;
        jse.exec(js -> js.invocable.invokeFunction("disconnect", callback));
    }
    
    public void ping() {
        Debug.trace();
        jse.exec(js -> socket.ping(collabid));
    }
    
    public Future<ShareDoc> open(IDocument local, IFile file, ITextEditor editor) {
        Debug.trace(file.getFullPath());
        CompletableFuture<ShareDoc> doc = new CompletableFuture<>();
        
        jse.exec(js -> {
            BiConsumer<Object, String> callback = (sharedbdoc, remote) -> {
                Runnable ok = () -> doc.complete(new ShareDoc(this, sharedbdoc, local, editor));
                if (local.get().equals(remote)) {
                    ok.run();
                } else {
                    Runnable cancel = () -> doc.cancel(true);
                    CompareUI.openCompareDialog(new LocalRemoteCompare(file, local, remote, ok, cancel));
                }
            };
            js.invocable.invokeFunction("open", file.getProjectRelativePath().toPortableString(), local.get(), callback);
        });
        
        return doc;
    }
    
    public void onFeedbackAvailable() {
        Debug.trace();
        PlatformUI.getWorkbench().getDisplay().asyncExec(() -> {
            try {
                showFeedbackView(false);
            } catch (PartInitException pie) {
                Activator.showErrorDialog(null, "Error showing feedback view", pie);
            }
        });
    }
    
    public void onFeedbackPublished(String id, String json) {
        Debug.trace();
        PlatformUI.getWorkbench().getDisplay().asyncExec(() -> {
            try {
                showFeedbackView(true).add(id, json);
            } catch (PartInitException pie) {
                Activator.showErrorDialog(null, "Error showing new feedback", pie);
            }
        });
    }
    
    private FeedbackView showFeedbackView(boolean visible) throws PartInitException {
        IWorkbenchPage page = PlatformUI.getWorkbench().getActiveWorkbenchWindow().getActivePage();
        return (FeedbackView)page.showView(FEEDBACK, null, visible ? IWorkbenchPage.VIEW_VISIBLE : IWorkbenchPage.VIEW_CREATE);
    }
}
