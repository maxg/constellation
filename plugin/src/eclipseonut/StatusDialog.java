package eclipseonut;

import static eclipseonut.Util.assertNotNull;
import static java.util.Arrays.asList;

import java.util.Arrays;
import java.util.LinkedList;
import java.util.List;
import java.util.TreeSet;

import org.eclipse.jdt.annotation.Nullable;
import org.eclipse.jface.dialogs.MessageDialog;
import org.eclipse.jface.resource.JFaceResources;
import org.eclipse.swt.SWT;
import org.eclipse.swt.custom.CLabel;
import org.eclipse.swt.graphics.Font;
import org.eclipse.swt.graphics.FontData;
import org.eclipse.swt.graphics.Image;
import org.eclipse.swt.graphics.Resource;
import org.eclipse.swt.layout.GridData;
import org.eclipse.swt.layout.GridLayout;
import org.eclipse.swt.widgets.Composite;
import org.eclipse.swt.widgets.Control;
import org.eclipse.swt.widgets.Label;
import org.eclipse.swt.widgets.Shell;

public class StatusDialog extends MessageDialog {
    
    public static final int CONTINUE = 0;
    public static final int STOP = 1;
    
    private final Collaboration collab;
    private final List<Resource> resources = new LinkedList<>();
    
    public StatusDialog(@Nullable Shell parentShell, Collaboration collab) {
        // no messageLabel
        super(parentShell, "Collaboration status", null, null, CONFIRM, 0, "Continue", "Stop");
        this.collab = collab;
    }
    
    @Override
    protected Control createCustomArea(Composite parent) {
        FontData[] fontData = JFaceResources.getDialogFont().getFontData();
        Arrays.stream(fontData).forEach(f -> f.setHeight(f.getHeight() * 5 / 2));
        Font larger = new Font(parent.getDisplay(), fontData);
        resources.add(larger);
        
        // reset to 1 column wide so we land where the messageLabel would normally be
        GridData data = new GridData(GridData.FILL_BOTH);
        parent.setLayoutData(data);
        
        Composite composite = new Composite(parent, SWT.NONE);
        GridLayout layout = new GridLayout();
        composite.setLayout(layout);
        
        Image icon = assertNotNull(collab.state().icon.createImage(), "Cannot create icon");
        resources.add(icon);
        CLabel status = new CLabel(composite, SWT.NONE);
        status.setImage(icon);
        status.setText(collab.state().description);
        label(composite, collab.project.getName(), larger);
        label(composite, "by");
        for (String user : new TreeSet<>(asList(collab.me, collab.partner))) {
            label(composite, user, larger);
        }
        
        return composite;
    }
    
    private Label label(Composite composite, String text, Font... fonts) {
        Label label = new Label(composite, SWT.NONE);
        label.setText(text);
        for (Font font : fonts) { label.setFont(font); }
        return label;
    }
    
    @Override
    public boolean close() {
        try {
            return super.close();
        } finally {
            resources.forEach(Resource::dispose);
        }
    }
}
