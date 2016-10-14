package eclipseonut;

import org.eclipse.jface.resource.ImageDescriptor;

public enum CollaborationState {
    
    NONE("collab-stopped"),
    CONNECTING("collab-started"),
    CONNECTED("collab-started"),
    RECONNECTING("collab-warning"),
    ALONE("collab-warning"),
    DISCONNECTED("collab-error");
    
    public final ImageDescriptor icon;
    public final String description;
    
    private CollaborationState(String icon) {
        this.icon = Activator.getIcon(icon);
        this.description = Activator.getString("command.collaborate." + name().toLowerCase());
    }
}
