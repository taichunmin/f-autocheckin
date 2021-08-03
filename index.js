require('dotenv').config()

const _ = require('lodash')
const axios = require('axios')
const CryptoJS = require('crypto-js')
const Papa = require('papaparse')

exports.main = async () => {
  try {
    // 取得使用者清單 https://docs.google.com/spreadsheets/d/1bt29NOUfkWb560gtVCIhAga5EUDfRoBxQSy8t3Bid_w/edit#gid=0
    const uids = await exports.getCsv(exports.getenv('CSV_UIDS', 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTaovyChshdAhrzaIb7facPVm3BU4WGGBXw0TfZxlJStKObq9FcXk3RIoM3sGEpQuVr8_CYnGxvWM_e/pub?gid=0&single=true&output=csv'))
    console.log(`共取得 ${uids.length} 個使用者`)

    for (const uid of uids) {
      try {
        await exports.checkin(uid.uid)
        console.log(`使用者 ${uid.uid} 簽到成功`)
      } catch (err) {
        console.error(`使用者 ${uid.uid} 簽到失敗, ${JSON.stringify(exports.errToPlainObj(err))}`)
      }
      await exports.sleep(500)
    }
  } catch (err) {
    err.message = _.get(err, 'response.data.message', err.message)
    console.error(`程式執行失敗, ${JSON.stringify(exports.errToPlainObj(err))}`)
  }
}

/**
 * 取得 process.env.[key] 的輔助函式，且可以有預設值
 */
exports.getenv = (key, defaultval) => {
  return _.get(process, ['env', key], defaultval)
}

exports.sleep = t => new Promise(resolve => setTimeout(resolve, t))

exports.getCsv = async (url, cachetime = 3e4) => {
  const csv = _.trim(_.get(await axios.get(url, {
    params: { cachebust: _.floor(Date.now() / cachetime) },
  }), 'data'))
  return _.get(Papa.parse(csv, {
    encoding: 'utf8',
    header: true,
  }), 'data', [])
}

exports.apiPost = async (url, body) => {
  return _.get(await axios.post(url, body, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.107 Safari/537.36',
      Origin: 'https://a.feg.com.tw',
      Referer: 'https://a.feg.com.tw/FENC/',
    },
  }), 'data')
}

exports.checkin = async uid => {
  const ctx = { uid }
  try {
    const { enc: { Base64, Utf8 } } = CryptoJS
    ctx.pwd = Base64.stringify(Utf8.parse(`|${Date.now()}`))
    ctx.events = _.get(await exports.apiPost('https://a.feg.com.tw/oauth2/GRC_events', {
      ..._.pick(ctx, ['pwd', 'uid']),
      ver: '1.0.9',
    }), 'events')
    ctx.event = _.find(ctx.events, e => e.name === 'CheckIn') // || e.name === 'Update'
    if (!ctx.event) throw new Error('找不到 CheckIn')

    ctx.formId = ctx.event.path.slice(4)
    ctx.fields = _.chain(await exports.apiPost('https://a.feg.com.tw/BDD/API/bpm/comm/form/demo', _.pick(ctx, ['formId', 'pwd', 'uid'])))
      .map(f => {
        const subfields = [[f.field, f.value]]
        if (f.control) {
          subfields.push(..._.map(_.get(_.find(f.control, c => c.value === f.value), 'rule'), r => [r.field, r.value]))
        }
        return subfields
      })
      .flatten()
      .filter(f => !_.isNil(f[0]))
      .fromPairs()
      .value()
    await exports.apiPost('https://a.feg.com.tw/oauth2/form', ctx.fields)
  } catch (err) {
    err.message = _.get(err, 'response.data.message', err.message)
    _.set(err, 'data.ctx', ctx)
    throw err
  }
  return ctx
}

exports.errToPlainObj = (() => {
  const ERROR_KEYS = [
    'address',
    'code',
    'data',
    'dest',
    'errno',
    'info',
    'message',
    'name',
    'path',
    'port',
    'reason',
    'request.baseURL',
    'request.data',
    'request.headers',
    'request.method',
    'request.params',
    'request.url',
    'response.data',
    'response.headers',
    'response.status',
    'stack',
    'status',
    'statusCode',
    'statusMessage',
    'syscall',
  ]
  return err => _.pick(err, ERROR_KEYS)
})()

if (require.main === module) exports.main()
