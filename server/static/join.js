function rendezvous(me, form, partner, status, map) {

  var selectionXY; // [x, y]
  var selectionsection; // A-G

  form.on('submit', function() {
    try {
      $.ajax({
        type: 'POST',
        url: document.location.pathname,
        data: JSON.stringify({
          me: me.trim().toLowerCase().split(/\s+/),
          partner: partner.val().trim().toLowerCase().split(/\s+/),
          location: {
            section: selectionsection,
            seatX: selectionXY[0] / map.width(),
            seatY: selectionXY[1] / map.height()
          }
        }),
        contentType: 'application/json'
      }).done(function(responseJSON) {
        status.text('Redirecting...');
        document.location.href = responseJSON.redirect;
      }).fail(function(req) {
        status.text(req.responseJSON && req.responseJSON.error || 'Error');
      });
      status.text('Waiting for partner...');
    } catch (e) {
      console && console.error && console.error(e);
    }
    return false;
  });

  map.mousemove(function onMapHover(event) {
    render(this.querySelector('canvas'), event);
  });

  map.mouseleave(function onMapLeave() {
    render(this.querySelector('canvas'));
  });

  map.click(function onMapClick(event) {
    var section = getSection(this.querySelector('canvas'), event);
    if (!section) { return; }

    partner.prop('disabled', false);
    partner.focus();

    selectionXY = [event.offsetX, event.offsetY];
    selectionsection = section;
    render(this.querySelector('canvas'), event);
  });

  var cursorcolor = '#f006';
  var selectedcolor = '#f009';
  var shadecolor = '#0007';
  var cursorheight = 0.15; // % of image height

  var bounds = { // [minX, minY, maxX, maxY] as percentages
    A: [0.06, 0.07, 0.3, 0.475],
    B: [0.3, 0.07, 0.5, 0.475],
    C: [0.5, 0.07, 0.7, 0.475],
    D: [0.7, 0.07, 0.93, 0.475],
    E: [0, 0.475, 0.26, 0.945],
    F: [0.26, 0.475, 0.74, 0.945],
    G: [0.74, 0.475, 1, 0.945]
  };

  function getSection(canvas, event) {
    var x = event.offsetX, y = event.offsetY,
        width = canvas.width, height = canvas.height;
    for (var section in bounds) {
      var bound = bounds[section];
      if (x >= width * bound[0] && x <= width * bound[2]
          && y >= height * bound[1] && y <= height * bound[3]) {
        return section;
      }
    }
  }

  function render(canvas, event) {
    canvas.width = $(canvas).width();
    canvas.height = $(canvas).height();
    var radius = cursorheight * canvas.height / 2;

    var ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    var section = (event ? getSection(canvas, event) : undefined) || selectionsection;
    if (section) { // highlight section
      ctx.fillStyle = shadecolor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      var bound = bounds[section];
      var x = bound[0] * canvas.width, y = bound[1] * canvas.height,
          w = bound[2] * canvas.width - x, h = bound[3] * canvas.height - y;
      ctx.clearRect(x, y, w, h);
    }

    if (selectionXY) { // render selection
      ctx.fillStyle = selectedcolor;
      ctx.beginPath();
      ctx.arc(selectionXY[0], selectionXY[1], radius, 0, 2 * Math.PI);
      ctx.fill();
      ctx.strokeStyle = selectedcolor;
      var bound = bounds[selectionsection];
      var x = bound[0] * canvas.width, y = bound[1] * canvas.height,
          w = bound[2] * canvas.width - x, h = bound[3] * canvas.height - y;
      ctx.rect(x, y, w, h);
      ctx.stroke();
    }

    if (event) { // render cursor
      ctx.fillStyle = cursorcolor;
      ctx.beginPath();
      ctx.arc(event.offsetX, event.offsetY, radius, 0, 2 * Math.PI);
      ctx.fill();
    }
  }
}
