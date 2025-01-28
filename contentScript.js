// contentScript.js
// Zorg ervoor dat je de Google Calendar API hebt geconfigureerd en de juiste credentials hebt.

// Voeg functies toe om hashes te genereren en de status van afspraken bij te werken
function generateHash(text) {
    return btoa(text); // Genereer een Base64-code van de tekst
}

async function checkAppointmentStatus() {
    //console.log('Controleren op afspraken aan de hand van individuele hashes...');

    const token = await getAuthToken();
    const rows = document.querySelectorAll('.block.user_image table.list.overzicht tbody tr');

    for (const row of rows) {
        const cells = row.querySelectorAll('td');
        if (cells.length > 0) {
            const rawDateTime = cells[0].innerText.trim();
            const treatment = cells[1].innerText.trim();
            const person = cells[2].innerText.trim();

            const hash = generateHash(rawDateTime); // Genereer een hash van de datum/tijd

            // Controleer of de afspraak met deze hash bestaat in Google Agenda
            const { exists, eventLink } = await checkHashInGoogleCalendar(token, hash);

            const statusCell = document.createElement('td');
            if (exists) {
                //console.log(`Afspraak met hash ${hash} bestaat al.`);
                statusCell.innerHTML = `
                    <span style="color: green;" title="Afspraak staat in Google Agenda">✔️</span>
                    <a href="${eventLink}" target="_blank" style="margin-left: 10px;" title="Bekijk afspraak in Google Agenda">📅</a>
                `; // Groen vinkje met link naar afspraak
            } else {
                //console.log(`Afspraak met hash ${hash} bestaat nog niet.`);
                const refreshButton = document.createElement('button');
                refreshButton.innerText = '🔄'; // Ververs icoon
                refreshButton.style.cursor = 'pointer';
                refreshButton.style.background = 'none';
                refreshButton.style.border = 'none';
                refreshButton.style.fontSize = '16px';
                refreshButton.title = 'Zet afspraak in Google Agenda'; // Tooltip voor refresh knop
                refreshButton.addEventListener('click', async () => {
                    await createGoogleAppointment(rawDateTime, treatment, person, statusCell);
                });
                statusCell.appendChild(refreshButton);
            }
            row.appendChild(statusCell);
        }
    }
}

async function checkHashInGoogleCalendar(token, hash) {
    try {
        //console.log(`Zoeken naar afspraken met hash: ${hash}`);

        const response = await fetch(
            `https://www.googleapis.com/calendar/v3/calendars/primary/events?q=${encodeURIComponent(hash)}`,
            {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                },
            }
        );

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Fout bij zoeken naar afspraken in Google Agenda:', errorText);
            return { exists: false, eventLink: null };
        }

        const data = await response.json();
        const events = data.items || [];
        const event = events.find(event => event.description && event.description.includes(hash));

        if (event) {
            //console.log(`Afspraak gevonden: ${event.htmlLink}`);
            return { exists: true, eventLink: event.htmlLink };
        }

        //console.log(`Geen afspraak gevonden met hash ${hash}.`);
        return { exists: false, eventLink: null };
    } catch (error) {
        console.error('Fout bij controleren van hash in Google Agenda:', error);
        return { exists: false, eventLink: null };
    }
}

async function createGoogleAppointment(rawDateTime, treatment, person, statusCell) {
    //console.log('Nieuwe afspraak toevoegen aan Google Agenda:', rawDateTime);

    const dateTimeMatch = rawDateTime.match(/(\d{1,2}) (\w+) (\d{4}) om (\d{2}:\d{2})/);
    if (dateTimeMatch) {
        const [_, day, monthName, year, time] = dateTimeMatch;

        const months = {
            januari: '01',
            februari: '02',
            maart: '03',
            april: '04',
            mei: '05',
            juni: '06',
            juli: '07',
            augustus: '08',
            september: '09',
            oktober: '10',
            november: '11',
            december: '12',
        };

        const month = months[monthName.toLowerCase()];
        if (month) {
            const formattedDate = `${year}-${month}-${day.padStart(2, '0')}`;
            const startDateTime = new Date(`${formattedDate}T${time}:00`);
            const endDateTime = new Date(startDateTime.getTime() + 30 * 60000); // +30 min

            const hash = generateHash(rawDateTime);

            const appointment = {
                summary: `${getFirstName()} kapper (${time})`,
                location: getLocation(),
                start: startDateTime.toISOString(),
                end: endDateTime.toISOString(),
                description: `Behandeling: ${treatment}, Door: ${person}, Hash: ${hash}`,
            };

            const eventLink = await addToGoogleCalendar(appointment);

            // Update UI direct na het toevoegen van de afspraak
            statusCell.innerHTML = `
                <span style="color: green;" title="Afspraak staat in Google Agenda">✔️</span>
                <a href="${eventLink}" target="_blank" style="margin-left: 10px;" title="Bekijk afspraak in Google Agenda">📅</a>
            `;

            alert('Afspraak succesvol toegevoegd aan Google Agenda.');
        }
    } else {
        console.error('Kon datum/tijd niet parsen:', rawDateTime);
    }
}

function getLocation() {
    const blocks = document.querySelectorAll('.block');
    const targetBlock = Array.from(blocks).find(block => 
        block.querySelector('h2')?.textContent.trim() === 'Mijn kapper'
    );

    if (targetBlock) {
        const name = targetBlock.querySelectorAll('p')[0].textContent.trim();
        const address = targetBlock.querySelectorAll('p')[1].innerHTML.split('<br>')[0].trim();
        const postalAndCity = targetBlock.querySelectorAll('p')[1].innerHTML.split('<br>')[1].trim();
        const postalCode = postalAndCity.slice(0, 7).trim(); // Eerste 7 karakters voor postcode
        const city = postalAndCity.slice(8).trim(); // Vanaf karakter 8 voor plaatsnaam

        return `${name}, ${address}, ${postalCode} ${city}`;
    } else {
        console.error('Geen blok gevonden met <h2> "Mijn kapper".');
        return 'Onbekende locatie';
    }
}

function getFirstName() {
    const userBlocks = document.querySelectorAll('.block.user_image');
    const targetBlock = Array.from(userBlocks).find(block => 
        block.querySelector('h2')?.textContent.trim() === 'Mijn gegevens'
    );

    if (targetBlock) {
        const nameLine = targetBlock.querySelectorAll('p')[0].textContent.trim();
        const match = nameLine.match(/(?:Dhr\.|Mevr\.)\s+([A-Za-z]+)\s/);
        if (match) {
            //console.log(`Voornaam: ${match[1]}`);
            return match[1];
        } else {
            console.error('Voornaam niet gevonden in de naamregel.');
        }
    } else {
        console.error('Geen blok gevonden met <h2> "Mijn gegevens".');
    }
    return 'Klant';
}

async function addToGoogleCalendar(appointment) {
    try {
        const token = await getAuthToken();
        const response = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                summary: appointment.summary,
                location: appointment.location,
                description: appointment.description,
                start: {
                    dateTime: appointment.start,
                    timeZone: 'Europe/Amsterdam',
                },
                end: {
                    dateTime: appointment.end,
                    timeZone: 'Europe/Amsterdam',
                },
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Fout bij toevoegen aan Google Agenda:', errorText);
            return null;
        } else {
            const eventData = await response.json();
            console.log('Succesvol toegevoegd aan Google Agenda:', eventData);
            return eventData.htmlLink;
        }
    } catch (error) {
        console.error('Fout bij toevoegen aan Google Agenda:', error);
        return null;
    }
}

function getAuthToken() {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ action: 'getAuthToken' }, response => {
            if (response && response.success) {
                resolve(response.token);
            } else {
                reject(response.error || 'Onbekende fout bij ophalen token.');
            }
        });
    });
}

// Start het script door de status van afspraken te controleren
checkAppointmentStatus();