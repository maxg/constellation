package eclipseonut;

import static eclipseonut.Util.assertNotNull;
import static eclipseonut.Util.callIfNotNull;
import static eclipseonut.Util.startThread;
import static eclipseonut.Util.stringMap;

import java.io.IOException;
import java.net.URI;
import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.CancellationException;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Future;
import java.util.function.Consumer;

import org.eclipse.jdt.annotation.Nullable;
import org.eclipse.jetty.util.ajax.JSON;
import org.eclipse.jetty.util.ssl.SslContextFactory;
import org.eclipse.jetty.websocket.api.Session;
import org.eclipse.jetty.websocket.api.StatusCode;
import org.eclipse.jetty.websocket.api.annotations.OnWebSocketClose;
import org.eclipse.jetty.websocket.api.annotations.OnWebSocketConnect;
import org.eclipse.jetty.websocket.api.annotations.OnWebSocketError;
import org.eclipse.jetty.websocket.api.annotations.OnWebSocketMessage;
import org.eclipse.jetty.websocket.api.annotations.WebSocket;
import org.eclipse.jetty.websocket.client.WebSocketClient;

@WebSocket(maxIdleTime = 1000 * 60 * 60)
public class JSWebSocket {
    
    //
    // WebSocket constants
    //
    public static final int CONNECTING = 0;
    public static final int OPEN = 1;
    public static final int CLOSING = 2;
    public static final int CLOSED = 3;
    
    private static final Duration RECONNECT_BASE_DELAY = Duration.ofSeconds(1);
    private static final double RECONNECT_EXP_FACTOR = 1.7;
    private static final Duration RECONNECT_TIMEOUT = Duration.ofMinutes(1);
    
    private final JSEngine jse;
    private final URI uri;
    private final WebSocketClient client;
    private @Nullable Session session;
    private boolean willReconnect = true;
    
    //
    // WebSocket attributes
    //
    public @Nullable Runnable onopen;
    public @Nullable Consumer<Message> onmessage;
    public @Nullable Consumer<Throwable> onerror;
    public @Nullable Consumer<String> onclose;
    public int readyState = CONNECTING;
    
    //
    // WebSocket constructor
    //
    public JSWebSocket(JSEngine jse, URI uri) throws Exception {
        Debug.trace();
        this.jse = jse;
        this.uri = uri;
        SslContextFactory ssl = new SslContextFactory();
        if (Activator.debug()) { Debug.enableInsecureSSL(ssl); }
        client = new WebSocketClient(ssl);
        client.start();
    }
    
    public Future<Session> connect() throws IOException {
        Debug.trace(uri);
        readyState = CONNECTING;
        return client.connect(this, uri);
    }
    
    @OnWebSocketConnect
    public void onConnect(Session session) {
        Debug.trace();
        this.session = session;
        readyState = OPEN;
        jse.exec(js -> callIfNotNull(onopen));
    }
    
    @OnWebSocketMessage
    public void onMessage(String text) {
        jse.exec(js -> callIfNotNull(onmessage, new Message(text)));
    }
    
    @OnWebSocketClose
    public void onClose(int statusCode, String reason) {
        Debug.trace(readyState, "->", statusCode, reason);
        boolean reconnect = readyState == OPEN;
        readyState = CLOSED;
        jse.exec(js -> callIfNotNull(onclose, reason));
        if (reconnect) {
            scheduleReconnection(Instant.now(), 0);
        } else {
            jse.exec(js -> client.stop());
        }
        session = null;
    }
    
    @OnWebSocketError
    public void onError(Throwable error) {
        Debug.trace(error.getMessage());
        jse.exec(js -> callIfNotNull(onerror, error));
    }
    
    //
    // WebSocket method send
    //
    public void send(String text) {
        if (readyState != OPEN) {
            Log.error("Attempt to send to closed WebSocket");
        }
        jse.exec(js -> assertSession(session).getRemote().sendStringByFuture(text));
    }
    
    //
    // WebSocket method close
    //
    public void close() {
        Debug.trace();
        willReconnect = false;
        if (readyState != OPEN) {
            return;
        }
        readyState = CLOSING;
        // ShareDB connection to "closed" state
        jse.exec(js -> assertSession(session).close(StatusCode.NORMAL, "closed"));
    }
    
    public void ping(String collabid) {
        Debug.trace();
        if (readyState != OPEN) {
            return;
        }
        send(JSON.toString(stringMap("a", "ping", "collabid", collabid)));
    }
    
    private void scheduleReconnection(Instant started, int attempt) {
        Debug.trace(uri, attempt);
        if (Instant.now().isAfter(started.plus(RECONNECT_TIMEOUT))) {
            // ShareDB connection to "stopped" state
            onClose(StatusCode.NORMAL, "stopped");
            return;
        }
        long delay = RECONNECT_BASE_DELAY.toMillis() * (int)Math.pow(RECONNECT_EXP_FACTOR, attempt);
        jse.schedule(js -> {
            if (readyState == OPEN || ! willReconnect) {
                return;
            }
            Future<Session> session = connect();
            startThread(() -> {
                try {
                    session.get();
                } catch (CancellationException ce) {
                    // canceled?
                } catch (InterruptedException | ExecutionException e) {
                    scheduleReconnection(started, attempt+1);
                }
            });
        }, (int)(delay + delay * .25 * (Math.random() - .5)));
    }
    
    private Session assertSession(@Nullable Session session) {
        return assertNotNull(session, "WebSocket missing session in state " + readyState);
    }
    
    public static class Message {
        public final String data;
        public Message(String data) { this.data = data; }
    }
}
