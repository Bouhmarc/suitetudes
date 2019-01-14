const {
  BaseKonnector,
  requestFactory,
  signin,
  scrape,
  saveFiles,
  log
} = require('cozy-konnector-libs')
const request = requestFactory({

  // the debug mode shows all the details about http request and responses. Very useful for
  // debugging but very verbose. That is why it is commented out by default
  //debug: true,
  // activates [cheerio](https://cheerio.js.org/) parsing on each page
  cheerio: true,
  // If cheerio is activated do not forget to deactivate json parsing (which is activated by
  // default in cozy-konnector-libs
  json: false,
  // this allows request-promise to keep cookies between requests
  jar: true
})

const baseUrl = 'http://proprietaires.suitetudes.com/Accueil.aspx'
var cache = [];
var $;
var fields;
module.exports = new BaseKonnector(start)

// The start function is run by the BaseKonnector instance only when it got all the account
// information (fields). When you run this connector yourself in "standalone" mode or "dev" mode,
// the account information come from ./konnector-dev-config.json file
async function start(fieldslocal) {

  fields = fieldslocal;
  log('info', 'Authenticating ...')
  await authenticate(fields.login, fields.password)
  log('info', 'Successfully logged in')
  // The BaseKonnector instance expects a Promise as return of the function
  log('info', 'Fetching the contracts')
  documents = await fetchDocuments();

    log('info', 'Saving data to Cozy')
    await saveFiles(documents, fields, {
      timeout: Date.now () + 300 * 1000
    })

}

// this shows authentication using the [signin function](https://github.com/konnectors/libs/blob/master/packages/cozy-konnector-libs/docs/api.md#module_signin)
// even if this in another domain here, but it works as an example
function authenticate(username, password) {
  return signin({
    url: `http://proprietaires.suitetudes.com/fr/Accueil.aspx`,
    formSelector: '#form2',
    formData: { 
       Connection1$lgnUser$UserName: username, 
       Connection1$lgnUser$Password: password , 
       'Connection1$lgnUser$LoginButton.x':15, 
       'Connection1$lgnUser$LoginButton.y':14 },
    // the validate function will check if the login request was a success. Every website has
    // different ways respond: http status code, error message in html ($), http redirection
    // (fullResponse.request.uri.href)...
    validate: (statusCode, obj, fullResponse) => {
    $ = obj; 
     if ($('.bouton_deconnexion').length === 1) {
      return true;
     } else {
       return false;
     }
    }
  })
}

async function fetchDocuments()
{

  var documents = [];
 
  // recupere les factures
  documents = await fetchFactures();

  log('info',JSON.stringify(documents));


  return documents;
}
function parseFactures($)
{
  var sNumContrat = $('#ctl00_MainContent_LoyersFactures_ddlListBail>option[selected="selected"]')[0].attribs.value;
  log ('info','contrat selectionne : ' + sNumContrat);

  const docs = scrape(
    $,
    {
      title: {
        sel: 'td:nth-child(1)',
      },
      date: {
        sel: 'td:nth-child(2)'
      },
      fileurl: {
        sel: 'td:nth-child(3) a',
        attr: 'href',
        parse: src => `${baseUrl}/${src}`
      },
      description: {
        sel: 'td:nth-child(3)'
      }
    },
    '#ctl00_MainContent_LoyersFactures_gv_factures tbody tr'
  )

  log('info','nombre de factures trouvees pour le contrat:'+sNumContrat + ' : ' + docs.length);
  return docs.map(doc => ({
    ...doc,
    date: normalizeDate(doc.date),
    contract: sNumContrat,
    vendor: 'SuiteEtude',
    metadata: {
      // it can be interesting that we add the date of import. This is not mandatory but may$
      // useful for debugging or data migration
      importDate: new Date(),
      // document version, useful for migration after change of document structure
      version: 1
    }
  }))



}
function normalizeDate(date) {
 const [day, month, year] = date.split('/')
 return new Date(`${year}-${month}-${day}`)
}

async function fetchFactures()
{
  // on fait la premiere requete pour recuperer les parametres
  $ = await request('http://proprietaires.suitetudes.com/fr/Loyers.aspx');
  
  // On affiche la liste des factures
  var options = {
    method: 'POST',
    uri: 'http://proprietaires.suitetudes.com/fr/Loyers.aspx',
    formselector:'',
    form: {
        '__VIEWSTATE':$('#__VIEWSTATE')[0].attribs.value, 
        '__VIEWSTATEGENERATOR':$('#__VIEWSTATEGENERATOR')[0].attribs.value, 
        '__EVENTVALIDATION':$('#__EVENTVALIDATION')[0].attribs.value,
        '__EVENTARGUMENT':'',
        '__EVENTTARGET':'',
        '__LASTFOCUS':'',
        'ctl00$MainContent$btn_menu_factures.x': 44,
        'ctl00$MainContent$btn_menu_factures.y': 15

     },
    };
  
  // Envoie la requete en post
  $ =  await request(options)
  // Recupere la liste des factures
  tabFactures = $('#ctl00_MainContent_LoyersFactures_ddlListBail>option');

  var documents = [];  
  for (i = 0 ; i < tabFactures.length ; i++)
  {
    // fait la requete pour recuperer les factures de ce contrat
    var options = {
      method: 'POST',
      uri: 'http://proprietaires.suitetudes.com/fr/Loyers.aspx',
      formselector:'',
      form: {
          '__VIEWSTATE':$('#__VIEWSTATE')[0].attribs.value, 
          '__VIEWSTATEGENERATOR':$('#__VIEWSTATEGENERATOR')[0].attribs.value, 
          '__EVENTVALIDATION':$('#__EVENTVALIDATION')[0].attribs.value,
          '__EVENTARGUMENT':'',
          '__EVENTTARGET':'',
          '__LASTFOCUS':'',
          'ctl00$MainContent$LoyersFactures$ddlListBail': tabFactures[i].attribs.value
       },
      };

    // recupere la page
    $ = await request(options);
    // recupere les factures de cette page
    var docs = await parseFactures($);
    documents.push(...docs);	
    // On sauve au fur et a mesure, sinon, il y a certains documents
  }

  return documents;

}
