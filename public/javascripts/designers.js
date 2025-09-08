$(document).ready(function () {
    $('select').on('change', function () {
        let designer = $(this).val();
        $('.state-row').not('.title-row').each(function (i, row) {
            if (designer === 'All' || $(row).data('allocation') === designer) {
                $(row).removeClass('hidden');
            } else {
                $(row).addClass('hidden');
            }
        });
    });

    let casesToQC = new Set();

    function updateButton() {
        let totalChecklist = $('input.checklist-checkbox[type="checkbox"]').length;
        let completedChecklist = $('input.checklist-checkbox[type="checkbox"]').filter(function () {
            return $(this).is(':checked');
        }).length;

        if (casesToQC.size > 0 && completedChecklist === totalChecklist) {
            $('#send-to-qc-button').removeClass('disabled');
        } else {
            $('#send-to-qc-button').addClass('disabled');
        }
        $('#send-to-qc-button').html(`${casesToQC.size} cases ready to send for QC - Click to Submit`);
    }

    $('input.checklist-checkbox[type="checkbox"]').on('change', function () {
        updateButton();
    });

    $('input.case-checkbox[type="checkbox"]').on('change', function () {
        if ($(this).is(':checked')) {
            casesToQC.add($(this).data('case_file_id'));
        } else {
            casesToQC.delete($(this).data('case_file_id'));
        }
        console.log(casesToQC);
        updateButton();
    });

    $('#send-to-qc-button').click(function () {
        console.log({case_files: casesToQC, queue_status: 'Ready for QC'});
        $.ajax({
            type: 'POST',
            url: 'http://www.prf.nll.mybluehost.me/wp-json/my-route/update-case-files-status',
            data: {case_files: Array.from(casesToQC), queue_status: 'Ready for QC'},
            dataType: 'text',
            success: (data) => {
                console.log(data);
                location.reload();
            }
        });
    });

});