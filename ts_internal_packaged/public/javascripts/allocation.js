$(document).ready(function () {
    console.log("hello world");
    let allocatedCases = {};
    let designer = '';

    function updateButton() {
        let allocatedCount = Object.keys(allocatedCases).length;
        let actionMessage = designer === '' ? ' - Select a designer' : `to ${designer}`;
        
        let isDisabled = designer == '' || allocatedCount === 0;
        
        if (isDisabled) {
            $('#allocation-button').addClass('disabled');
        } else {
            $('#allocation-button').removeClass('disabled');
        }

        $('#allocation-button').html(`${allocatedCount} cases ready to allocate ${actionMessage}`);
    }

    $('select').on('change', function () {
        designer = $(this).val();
        updateButton();
    });

    $('input.case-checkbox[type="checkbox"]').on('change', function () {
        if ($(this).is(':checked')) {
            allocatedCases[$(this).data('case_file_id')] = {
                case_id: $(this).data('case_id'),
                case_file: $(this).data('case_file'),
                case_owner: $(this).data('case_owner'),
                creation_time_ms: $(this).data('case_creation_time_ms'),
            };
        } else {
            delete allocatedCases[$(this).data('case_file_id')];
        }
        updateButton();
    });

    $('input.checklist-checkbox[type="checkbox"]').on('change', function () {
        updateButton();
    });

    $('#allocation-button').click(function () {
        let case_files = Object.keys(allocatedCases).map(id => ({
            id,
            case_id: allocatedCases[id].case_id,
            case_file: allocatedCases[id].case_file,
            creation_time_ms: allocatedCases[id].creation_time_ms,
            case_owner: allocatedCases[id].case_owner,
            designer,
        }));
        // $('')
        $.ajax({
            type: 'POST',
            url: '/allocate-case-files',
            data: JSON.stringify({case_files}),
            dataType: 'json',
            contentType: 'application/json',
            success: (data) => {
                case_files = Object.keys(allocatedCases).map(id => ({
                    id,
                    allocation: designer
                }));
                console.log(data);
                $.ajax({
                    type: 'POST',
                    url: 'http://www.prf.nll.mybluehost.me/wp-json/my-route/allocate-case-files',
                    data: {case_files},
                    dataType: 'text',
                    success: (data) => {
                        console.log(data);
                        location.reload();
                    }
                });
            },
        });
        
        // let case_files = Array.from(allocatedCases).map(id => ({id, allocation: designer}));
        
    });
});