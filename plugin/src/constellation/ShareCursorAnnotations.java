package constellation;

import static constellation.Util.assertNotNull;
import static java.util.Collections.emptyMap;
import static java.util.stream.Stream.concat;

import java.util.HashMap;
import java.util.Map;

import org.eclipse.jdt.annotation.Nullable;
import org.eclipse.jface.text.IPainter;
import org.eclipse.jface.text.ITextViewerExtension4;
import org.eclipse.jface.text.Position;
import org.eclipse.jface.text.source.Annotation;
import org.eclipse.jface.text.source.AnnotationPainter;
import org.eclipse.jface.text.source.AnnotationPainter.IDrawingStrategy;
import org.eclipse.jface.text.source.IAnnotationModelExtension;
import org.eclipse.jface.text.source.ISourceViewer;
import org.eclipse.swt.custom.StyledText;
import org.eclipse.swt.graphics.Color;
import org.eclipse.swt.graphics.GC;
import org.eclipse.swt.graphics.Point;
import org.eclipse.swt.graphics.RGB;
import org.eclipse.swt.widgets.Display;
import org.eclipse.ui.texteditor.DefaultMarkerAnnotationAccess;

public class ShareCursorAnnotations {
    
    private static final String CARET = "constellation.annotation.caret";
    private static final RGB CARET_COLOR = new RGB(181, 118, 117);
    private static final String SELECTION = "constellation.annotation.selection";
    private static final RGB SELECTION_COLOR = new RGB(242, 222, 222);
    
    private final ITextViewerExtension4 viewer;
    private final IAnnotationModelExtension model;
    private final AnnotationPainter painter;
    private final Map<String, Annotation> carets = new HashMap<>();
    private final Map<String, Annotation> selections = new HashMap<>();
    
    public ShareCursorAnnotations(ISourceViewer viewer) {
        this.viewer = (ITextViewerExtension4)viewer;
        this.model = assertNotNull((IAnnotationModelExtension)viewer.getAnnotationModel(),
                "Source viewer model annotation model missing");
        this.painter = new AnnotationPainter(viewer, new DefaultMarkerAnnotationAccess());
        this.viewer.addTextPresentationListener(painter);
        
        painter.addDrawingStrategy(CARET, new CaretDrawingStrategy());
        painter.addAnnotationType(CARET, CARET);
        painter.setAnnotationTypeColor(CARET, new Color(Display.getDefault(), CARET_COLOR));
        
        painter.addHighlightAnnotationType(SELECTION);
        painter.setAnnotationTypeColor(SELECTION, new Color(Display.getDefault(), SELECTION_COLOR));
        
        painter.paint(IPainter.CONFIGURATION);
    }
    
    public void update(String username, int offset, int start, int length) {
        Annotation caret = carets.computeIfAbsent(username, this::createCaret);
        Annotation selection = selections.computeIfAbsent(username, this::createSelection);
        Map<Annotation, Position> positions = new HashMap<>();
        positions.put(caret, new Position(offset));
        if (length > 0) {
            positions.put(selection, new Position(start, length));
        }
        model.replaceAnnotations(new Annotation[] { caret, selection }, positions);
    }
    
    public void close() {
        model.replaceAnnotations(
                concat(carets.values().stream(), selections.values().stream()).toArray(Annotation[]::new),
                emptyMap());
        viewer.removeTextPresentationListener(painter);
    }
    
    private Annotation createCaret(String username) {
        return new Annotation(CARET, false, "");
    }
    
    private Annotation createSelection(String username) {
        return new Annotation(SELECTION, false, "");
    }
}

class CaretDrawingStrategy implements IDrawingStrategy {
    
    private static final int BAR_WIDTH = 2;
    
    public void draw(Annotation annotation, @Nullable GC gc, StyledText textWidget, int offset, int length, Color color) {
        Point caret = textWidget.getLocationAtOffset(offset);
        if (gc == null) {
            textWidget.redraw(caret.x - BAR_WIDTH/2, caret.y, BAR_WIDTH+1, textWidget.getLineHeight(), false);
            return;
        }
        gc.setForeground(color);
        gc.setLineWidth(BAR_WIDTH);
        gc.drawLine(caret.x, caret.y, caret.x, caret.y + textWidget.getLineHeight());
    }
}
