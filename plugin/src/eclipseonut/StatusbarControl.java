package eclipseonut;

import org.eclipse.swt.SWT;
import org.eclipse.swt.widgets.Composite;
import org.eclipse.swt.widgets.Control;
import org.eclipse.swt.widgets.Label;
import org.eclipse.ui.menus.WorkbenchWindowControlContribution;

public class StatusbarControl extends WorkbenchWindowControlContribution {
    
    public StatusbarControl() {
    }
    
    protected Control createControl(Composite parent) {
        Composite comp = new Composite(parent, SWT.NONE);
        
        Label button = new Label(comp, SWT.NONE);
        button.setBackground(parent.getDisplay().getSystemColor(SWT.COLOR_BLUE));
        button.setText("Start collaboration");
        
        return comp;
    }
}
