$(document).ready(function() {
  let
    $traffic    = $('#traffic'),
    $chart      = $('#chart'),
    phases      = [1,2,3,4],
    actions     = { 1 : [], 2 : [], 3 : [], 4 : [] },
    msgs        = {},
    socket      = new WebSocket("ws://localhost:8855"),
    phaseLength = 500,
    chart,
    startTime,
    currentPhase;

  chart = new Chart($chart[0].getContext('2d'), {
      type: 'line',
      options : { spanGaps : true },
      data: {
        labels: [],
        datasets: [ 
          { data : [], borderColor : '#ff6384', fill : false, label : 'Resource 1' },
          { data : [], borderColor : '#36a2eb', fill : false, label : 'Resource 2' },
          { data : [], borderColor : '#cc65fe', fill : false, label : 'Resource 3' }
        ]
      }
    });

  phases.forEach(function(aPhase) {
    var
      $aPhase         = $('#phase'+aPhase+'add'),
      $aPhaseActions  = $('#phase'+aPhase+'actions');
      
    $aPhase.on('click','button',function() {
      var 
        action          = $(this).attr('action-id');
      $aPhaseActions.append(
        $('<div />')
          .addClass('text-center')
          .text('Resource '+action)
      );

      actions[aPhase].push(Number(action));
    });
  });

  function roundTrip(msg) {
    var
      requestId =  Math.round(Math.random()*10000000),
      payload = [msg,requestId].join(',');

    $traffic.append(
      $('<tr />')
        .attr('id','rid'+requestId)
        .addClass('table-info')
        .append(
          $('<td />').addClass('resource').text(msg),
          $('<td />').addClass('status').text('started'),
          $('<td />').addClass('roundtrip'),
          $('<td />').addClass('finish'),
          $('<td />').text(currentPhase)
        )
    );
    socket.send(payload);
    msgs[requestId] = new Date().getTime();
  };
  $('#trafficOneDest').on('click',function() {
    for (i = 1; i < 10; i += 1) {
      $('#phase1add [action-id="1"]').click();
      $('#phase2add [action-id="1"]').click();
      $('#phase3add [action-id="1"]').click();
      $('#phase4add [action-id="1"]').click();
    }
  });
  $('#trafficAllDest').on('click',function() {
    for (phase = 1; phase <= 3; phase += 1) {
      for (i = 1; i <= 10; i += 1) {
        $('#phase'+phase+'add [action-id="'+phase+'"]').click();
      }
    }
  });
  $('#trafficMixedDest').on('click',function() {
    for (phase = 1; phase <= 4; phase += 1) {
      for (i = 0; i < 20; i += 1) {
        $('#phase'+phase+'add [action-id="'+((i % 3)+1)+'"]').click();
      }
    }
  })
  $('#start').on('click',function() {
    let
      phaseCount = 1,
      phaseInterval;

    startTime = new Date().getTime();
    currentPhase = 1;
    phaseInterval = setInterval(function() {
      $('#phase'+phaseCount)
        .addClass('bg-secondary')
        .siblings()
        .removeClass('bg-secondary');

      actions[phaseCount].forEach(roundTrip);
      if (phaseCount === phases[phases.length-1]) {
        clearInterval(phaseInterval);
      }
      phaseCount += 1;
      currentPhase = phaseCount;
    }, phaseLength);
  });
  $('#reset').on('click',function() {
    $('.phase .actions').empty();
    $('.phase').removeClass('bg-secondary');
    $traffic.empty();
    actions = { 1 : [], 2 : [], 3 : [], 4 : [] };
    chart.data.datasets[0].data = [];
    chart.data.datasets[1].data = [];
    chart.data.datasets[2].data = [];
    chart.data.labels = [];
    chart.update();
  });
  socket.onopen = function (event) {
    socket.onmessage = function(event) {
      var
        msgId    = event.data;

      if (msgs[msgId]) {
        let
          $thisRequest  = $traffic.find('#rid'+msgId),
          $status       = $thisRequest.find('.status'),
          $roundTrip    = $thisRequest.find('.roundtrip'),
          $finish       = $thisRequest.find('.finish'),
          resource      = Number($thisRequest.find('.resource').text()),
          delayOfEvent  = new Date().getTime() - msgs[msgId];

        $thisRequest.removeClass('table-info').addClass('table-success');
        $status.text('finished');
        $thisRequest.find('.phase').text(currentPhase);
        $roundTrip.text(delayOfEvent);
        $finish.text(new Date().getTime() - startTime);
        chart.data.datasets[0].data.push(resource === 1 ? delayOfEvent : null);
        chart.data.datasets[1].data.push(resource === 2 ? delayOfEvent : null);
        chart.data.datasets[2].data.push(resource === 3 ? delayOfEvent : null);
        chart.data.labels.push(chart.data.labels.length);
        chart.update();
      }
    };
  };
});
