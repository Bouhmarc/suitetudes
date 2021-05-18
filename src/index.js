const {
  CookieKonnector,
  requestFactory,
  signin,
  scrape,
  saveFiles,
  log
} = require('cozy-konnector-libs')
const url = require('url')

const baseUrl = 'https://proprietaires.suitetudes.com/fr'
var $

class SuiteEtudeConnector extends CookieKonnector {
  constructor()
  {
     super()
     
     this.request = requestFactory({
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
  }

  testSession() {
    return (this._jar.length > 0)

  }

  async fetch(fields)
  {
    log('info', 'Authenticating ...')
    await this.authenticate(fields.login, fields.password)
    log('info', 'Successfully logged in')
    // The BaseKonnector instance expects a Promise as return of the function
    log('info', 'Fetching the contracts')
    var documents = await this.fetchDocuments()
  
    log('info', 'Saving data to Cozy')
    await saveFiles(documents, fields, {
      timeout: Date.now() + 300 * 1000
    })  
  }

  // this shows authentication using the [signin function](https://github.com/konnectors/libs/blob/master/packages/cozy-konnector-libs/docs/api.md#module_signin)
// even if this in another domain here, but it works as an example
 authenticate(username, password) {
  return signin({
    url: `https://proprietaires.suitetudes.com/fr/Accueil.aspx`,
    formSelector: '#form2',
    formData: {
      Connection1$lgnUser$UserName: username,
      Connection1$lgnUser$Password: password,
      'Connection1$lgnUser$LoginButton.x': 15,
      'Connection1$lgnUser$LoginButton.y': 14
    },
    // the validate function will check if the login request was a success. Every website has
    // different ways respond: http status code, error message in html ($), http redirection
    // (fullResponse.request.uri.href)...
    validate: (statusCode, obj) => {
      $ = obj
      if ($('.bouton_deconnexion').length === 1) {
        return true
      } else {
        return false
      }
    }
  })
}


async fetchDocuments() {
  var documents = []

  // recupere les factures
  documents = await this.fetchFactures()

  return documents
}
async parseFactures($) {
  var sNumContrat = $(
    '#ctl00_MainContent_LoyersFactures_ddlListBail>option[selected="selected"]'
  )[0].attribs.value
  log('info', 'contrat selectionne : ' + sNumContrat)

  const docs = scrape(
    $,
    {
      title: {
        sel: 'td:nth-child(1)'
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

  log(
    'info',
    'nombre de factures trouvees pour le contrat:' +
      sNumContrat +
      ' : ' +
      docs.length
  )
  return docs.map(doc => ({
    ...doc,
    date: this.normalizeDate(doc.date),
    filename: this.parseTitle(doc.fileurl),
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
parseTitle (sURL)
{
  var MonUrl = new URL(sURL);
  
  log('info', JSON.stringify(MonUrl))

  //log('info',MonUrl.searchParams.get('check'))
  //return 'test'
  return MonUrl.searchParams.get('check')
}
normalizeDate(date) {
  const [day, month, year] = date.split('/')
  return new Date(`${year}-${month}-${day}`)
}

async fetchFactures() {
  // on fait la premiere requete pour recuperer les parametres
  $ = await this.request('https://proprietaires.suitetudes.com/fr/Loyers.aspx')

  // On affiche la liste des factures
  var options = {
    method: 'POST',
    uri: 'https://proprietaires.suitetudes.com/fr/Loyers.aspx',
    formselector: '',
    form: {
      __VIEWSTATE: $('#__VIEWSTATE')[0].attribs.value,
      __VIEWSTATEGENERATOR: $('#__VIEWSTATEGENERATOR')[0].attribs.value,
      __EVENTVALIDATION: $('#__EVENTVALIDATION')[0].attribs.value,
      __EVENTARGUMENT: '',
      __EVENTTARGET: '',
      __LASTFOCUS: '',
      'ctl00$MainContent$btn_menu_factures.x': 44,
      'ctl00$MainContent$btn_menu_factures.y': 15
    }
  }

  // Envoie la requete en post
  $ = await this.request(options)
  // Recupere la liste des factures
  var tabFactures = $('#ctl00_MainContent_LoyersFactures_ddlListBail>option')

  var documents = []

  for (var i = 0; i < tabFactures.length; i++) {
    // fait la requete pour recuperer les factures de ce contrat
    options = {
      method: 'POST',
      uri: 'https://proprietaires.suitetudes.com/fr/Loyers.aspx',
      formselector: '',
      form: {
        __VIEWSTATE: $('#__VIEWSTATE')[0].attribs.value,
        __VIEWSTATEGENERATOR: $('#__VIEWSTATEGENERATOR')[0].attribs.value,
        __EVENTVALIDATION: $('#__EVENTVALIDATION')[0].attribs.value,
        __EVENTARGUMENT: '',
        __EVENTTARGET: '',
        __LASTFOCUS: '',
        ctl00$MainContent$LoyersFactures$ddlListBail:
          tabFactures[i].attribs.value
      }
    }

    // recupere la page
    $ = await this.request(options)
    // recupere les factures de cette page
    var docs = await this.parseFactures($)
    documents.push(...docs)
    // On sauve au fur et a mesure, sinon, il y a certains documents
  }

  return documents
}



}




const connector = new SuiteEtudeConnector()

connector.run()