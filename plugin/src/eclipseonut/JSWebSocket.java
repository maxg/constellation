package eclipseonut;

import java.util.HashMap;

import javax.script.Bindings;
import javax.script.SimpleBindings;

import org.eclipse.core.commands.Command;
import org.eclipse.core.commands.ExecutionEvent;
import org.eclipse.jetty.websocket.api.Session;
import org.eclipse.jetty.websocket.api.StatusCode;
import org.eclipse.jetty.websocket.api.annotations.OnWebSocketClose;
import org.eclipse.jetty.websocket.api.annotations.OnWebSocketConnect;
import org.eclipse.jetty.websocket.api.annotations.OnWebSocketError;
import org.eclipse.jetty.websocket.api.annotations.OnWebSocketMessage;
import org.eclipse.jetty.websocket.api.annotations.WebSocket;
import org.eclipse.jface.dialogs.MessageDialog;
import org.eclipse.swt.widgets.Display;
import org.eclipse.swt.widgets.Shell;
import org.eclipse.ui.PlatformUI;
import org.eclipse.ui.commands.ICommandService;

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
        Log.ok("JSWebSocket connected: " + session.getRemoteAddress());
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
            engine.eval("fn({ data: msg })", env);
        });
    }
    
    @OnWebSocketClose
    public void onClose(int statusCode, String reason) {
        Log.ok("JSWebSocket closed " + statusCode + ": " + reason);
        Bindings env = new SimpleBindings();
        env.put("fn", onclose);
        env.put("code", statusCode);
        js.exec(engine -> engine.eval("fn(code)", env));
        
        if (statusCode != StatusCode.NORMAL) {
            Display.getDefault().asyncExec(() -> {
                Shell shell = PlatformUI.getWorkbench().getActiveWorkbenchWindow().getShell();
                MessageDialog dialog = new MessageDialog(shell, "Reconnect?", null,
                        "Eclipseonut is disconnected from the server.", MessageDialog.NONE,
                        new String[] {"Reconnect", "Cancel"}, 0);
                int result = dialog.open();
                
                ICommandService commandService = PlatformUI.getWorkbench().
                        getActiveWorkbenchWindow().getService(ICommandService.class);
                
                if (result == 0) {
                    Command execute = commandService.getCommand("eclipseonut.command.reconnect");
                    try {
                        execute.executeWithChecks(new ExecutionEvent(execute,
                                new HashMap<String, String>(), null, null));
                    } catch (Exception e) {
                        e.printStackTrace();
                    }
                } else {
                    Command execute = commandService.getCommand("eclipseonut.command.collaborate");
                    try {
                        execute.executeWithChecks(new ExecutionEvent(execute,
                                new HashMap<String, String>(), null, null));
                    } catch (Exception e) {
                        e.printStackTrace();
                    }
                }
            });
        }
    }
    
    @OnWebSocketError
    public synchronized void onError(Throwable error) {
        Log.error("JSWebSocket error", error);
    }
    
    public void send(Object data) {
        js.exec(engine -> {
            session.getRemote().sendString(data.toString());
        });
    }
}
