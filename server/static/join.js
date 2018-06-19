function rendezvous(me, form, partner, status, map, mapbounds) {

  var canvas = map.find('canvas')[0];
  var ctx = canvas.getContext('2d');

  var selectionXY; // [x, y]
  var selectionsection;

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
    render(event);
  });

  map.mouseleave(function onMapLeave() {
    render();
  });

  map.click(function onMapClick(event) {
    var section = getSection(event);
    if (!section) { return; }

    partner.prop('disabled', false);
    partner.focus();

    selectionXY = [event.offsetX, event.offsetY];
    selectionsection = section;
    render(event);
  });

  var cursorcolor = '#f006';
  var selectedcolor = '#f009';
  var shadecolor = '#0007';
  var cursorheight = 0.15; // % of image height

  function getSection(event) {
    var x = event.offsetX, y = event.offsetY,
        width = canvas.width, height = canvas.height;
    for (var section in mapbounds) {
      var bound = mapbounds[section];
      if (x >= width * bound.minX && x <= width * bound.maxX
          && y >= height * bound.minY && y <= height * bound.maxY) {
        return section;
      }
    }
  }

  function render(event) {
    canvas.width = $(canvas).width();
    canvas.height = $(canvas).height();
    var radius = cursorheight * canvas.height / 2;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    var section = (event ? getSection(event) : undefined) || selectionsection;
    if (section) { // highlight section
      ctx.fillStyle = shadecolor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      var bound = mapbounds[section];
      var x = bound.minX * canvas.width, y = bound.minY * canvas.height,
          w = bound.maxX * canvas.width - x, h = bound.maxY * canvas.height - y;
      ctx.clearRect(x, y, w, h);
    }

    if (selectionXY) { // render selection
      ctx.fillStyle = selectedcolor;
      ctx.beginPath();
      ctx.arc(selectionXY[0], selectionXY[1], radius, 0, 2 * Math.PI);
      ctx.fill();
      ctx.strokeStyle = selectedcolor;
      var bound = mapbounds[selectionsection];
      var x = bound.minX * canvas.width, y = bound.minY * canvas.height,
          w = bound.maxX * canvas.width - x, h = bound.maxY * canvas.height - y;
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
