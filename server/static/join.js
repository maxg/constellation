function rendezvous(me, form, partner, status) {
  form.on('submit', function() {
    try {
      $.ajax({
        type: 'POST',
        url: document.location.pathname,
        data: JSON.stringify({
          me: me.trim().toLowerCase().split(/\s+/),
          partner: partner.val().trim().toLowerCase().split(/\s+/)
        }),
        contentType: 'application/json'
      }).done(function(responseJSON) {
        status.text('Redirecting...');
        document.location.href = responseJSON.redirect;
      }).fail(function(req) {
        status.text(req.responseJSON.error || 'Error');
      });
      status.text('Waiting for partner...');
    } catch (e) {
      console && console.error && console.error(e);
    }
    return false;
  });
}
