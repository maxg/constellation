package eclipseonut;

import java.io.IOException;
import java.io.InputStreamReader;
import java.net.MalformedURLException;
import java.net.URI;
import java.net.URL;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Future;
import java.util.function.BiConsumer;

import javax.script.Bindings;
import javax.script.SimpleBindings;

import org.eclipse.compare.CompareUI;
import org.eclipse.core.resources.IFile;
import org.eclipse.core.resources.IProject;
import org.eclipse.core.runtime.Platform;
import org.eclipse.core.runtime.SubMonitor;
import org.eclipse.jetty.util.UrlEncoded;
import org.eclipse.jetty.util.ajax.JSON;
import org.eclipse.jetty.util.ssl.SslContextFactory;
import org.eclipse.jetty.websocket.api.Session;
import org.eclipse.jetty.websocket.api.StatusCode;
import org.eclipse.jetty.websocket.client.ClientUpgradeRequest;
import org.eclipse.jetty.websocket.client.WebSocketClient;
import org.eclipse.jface.text.IDocument;
import org.eclipse.ui.PartInitException;
import org.eclipse.ui.PlatformUI;
import org.eclipse.ui.texteditor.ITextEditor;

import eclipseonut.prefs.Preferences;

public class ShareJS {
    public static Optional<Settings> getSettings(IProject project, SubMonitor progress) throws IOException, PartInitException, InterruptedException, ExecutionException {
        progress.setWorkRemaining(3);
        
        progress.subTask("Authenticating");
        String version = Platform.getBundle("eclipseonut.plugin").getHeaders().get("Bundle-Version");
        String userid = new Cancelable<>(progress, () -> {
            return get("/userid/" + version);
        }).get().get("userid");
        if (userid.equals("Out-of-date")) {
            System.out.println(version);
            browse("/update/" + version);
            
            progress.setCanceled(true);
            return Optional.empty();
        }
        progress.worked(1);
        
        String projectName = UrlEncoded.encodeString(project.getName());
        
        browse("/pair/" + projectName + "/" + userid);
        progress.worked(1);
        
        progress.subTask("Waiting for pair...");
        Settings settings = new Settings(project, new Cancelable<>(progress, () -> {
            return get("/collab/" + projectName + "/" + userid);
        }).get(), userid);
        progress.worked(1);
        
        return Optional.of(settings);
    }
    
    public static class Settings {
        
        public final IProject project;
        public final String collabid;
        public final String userid;
        
        Settings(IProject project, Map<String, String> settings, String userid) {
            this.project = project;
            this.collabid = settings.get("collabid");
            this.userid = userid;
        }
    }
    
    @SuppressWarnings("unchecked")
    private static Map<String, String> get(String path) throws IOException {
        URL url = new URL(Preferences.http() + path);
        return (Map<String, String>)JSON.parse(new InputStreamReader(url.openStream()));
    }
    
    private static void browse(String path) throws PartInitException, MalformedURLException {
        URL url = new URL(Preferences.http() + path);
        PlatformUI.getWorkbench().getBrowserSupport().getExternalBrowser().openURL(url);
    }
    
    private final JSEngine js;
    private final String collab;
    private JSWebSocket socket;
    private WebSocketClient client;
    private Future<Session> session;
    
    public ShareJS(JSEngine js, String collab) throws Exception {
        this.js = js;
        this.collab = collab;
    }
    
    public void connect() throws Exception {
        socket = new JSWebSocket(js);
        client = new WebSocketClient(new SslContextFactory(true)); // XXX trust!
        client.start();
        
        js.execScript("share");
        js.exec((engine) -> {
            engine.put("SOCKET", socket);
            engine.eval("var CONNECTION = new window.sharejs.Connection(SOCKET);");
            session = client.connect(socket, new URI(Preferences.ws()), new ClientUpgradeRequest());
        });
    }
    
    public Future<ShareDoc> open(final IDocument local, final String userid, final IFile file, final ITextEditor editor) {
        final CompletableFuture<ShareDoc> doc = new CompletableFuture<>();
        
        final Bindings env = new SimpleBindings();
        env.put("collab", collab);
        env.put("path", file.getFullPath().toPortableString());
        env.put("contents", local.get());
        
        // callback for open gets context and current contents
        env.put("callback", (BiConsumer<Object, String>)(contexts, remote) -> {
            Runnable ok = () -> {
                doc.complete(new ShareDoc(js, local, userid, contexts, editor));
            };
            Runnable cancel = () -> {
                doc.cancel(true);
            };
            if (local.get().equals(remote)) {
                ok.run();
            } else {
                CompareUI.openCompareDialog(new ShareCompare(file, local, remote, ok, cancel));
            }
        });
        
        // call open to subscribe to the doc
        js.exec((engine) -> {
            env.put("open", engine.get("open"));
            engine.eval("open(collab, path, contents, callback)", env);
        });
        
        return doc;
    }
    
    public void close() {
        try {
            session.get().close(StatusCode.NORMAL, "Button pressed.");
            client.stop();
        } catch (InterruptedException ie) {
            ie.printStackTrace();
        } catch (ExecutionException ee) {
            ee.printStackTrace();
        } catch (Exception e) {
            e.printStackTrace();
        }
    }
}
