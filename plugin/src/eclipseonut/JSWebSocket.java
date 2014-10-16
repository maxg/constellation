package eclipseonut;

import javax.script.Bindings;
import javax.script.SimpleBindings;

import org.eclipse.jetty.websocket.api.Session;
import org.eclipse.jetty.websocket.api.annotations.OnWebSocketClose;
import org.eclipse.jetty.websocket.api.annotations.OnWebSocketConnect;
import org.eclipse.jetty.websocket.api.annotations.OnWebSocketError;
import org.eclipse.jetty.websocket.api.annotations.OnWebSocketMessage;
import org.eclipse.jetty.websocket.api.annotations.WebSocket;

@WebSocket(maxIdleTime = 1000 * 60 * 60)
public class JSWebSocket {
    
    private final JSEngine js;
    
    private Session session;
    
    public Object onopen;
    public Object onmessage;
    public Object onerror;
    public Object onclose;
    
    public JSWebSocket(JSEngine js) {
        this.js = js;
    }

    @OnWebSocketConnect
    public void onConnect(Session session) {
        this.session = session;
        Bindings env = new SimpleBindings();
        env.put("fn", onopen);
        js.exec(engine -> engine.eval("fn()", env));
    }

    @OnWebSocketMessage
    public void onMessage(String msg) {
        Bindings env = new SimpleBindings();
        env.put("fn", onmessage);
        env.put("msg", new String(msg));
        js.exec(engine -> {
            env.put("obj", engine.eval("JSON.parse(msg)", env));
            engine.eval("fn(obj)", env);
        });
    }
    
    @OnWebSocketClose
    public void onClose(int statusCode, String reason) {
        Bindings env = new SimpleBindings();
        env.put("fn", onclose);
        env.put("code", statusCode);
        js.exec(engine -> engine.eval("fn(code)", env));
    }
    
    @OnWebSocketError
    public synchronized void onError(Throwable error) {
        error.printStackTrace();
    }
    
    public void send(Object data) {
        Bindings env = new SimpleBindings();
        env.put("data", data);
        js.exec(engine -> {
            String json = engine.eval("JSON.stringify(data)", env).toString();
            session.getRemote().sendString(json);
        });
    }
}
