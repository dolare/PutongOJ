const User = require('../models/User')
const Solution = require('../models/Solution')
const Group = require('../models/Group')
const config = require('../config')
const logger = require('../utils/logger')
const { generatePwd } = require('../utils/helper')
const { isAdmin, isRoot, isUndefined } = require('../utils/helper')

const preload = async (ctx, next) => {
  const uid = ctx.params.uid
  const user = await User.findOne({ uid }).exec()
  if (user == null) ctx.throw(400, 'No such a user')
  ctx.state.user = user
  return next()
}

// 查询用户组
const find = async (ctx) => {
  const filter = {}
  if (!isUndefined(ctx.query.privilege) && ctx.query.privilege === 'admin') {
    filter.privilege = {
      $in: [config.privilege.Root, config.privilege.Teacher]
    }
  }
  const list = await User
    .find(filter)
    .select('uid nick privilege')
    .exec()
  ctx.body = {
    list
  }
}

// 查询用户具体信息
const findOne = async (ctx) => {
  const uid = ctx.query.uid
  const [user, solved, unsolved] = await Promise.all([
    User
      .findOne({ uid })
      .select('-_id -pwd')
      .exec(),
    Solution
      .find({ uid, judge: config.judge.Accepted })
      .distinct('pid')
      .exec(),
    Solution
      .find({ uid, judge: { $ne: config.judge.Accepted } })
      .distinct('pid')
      .exec()
  ])
  const procedure = user.gid.map((gid) => Group.findOne({gid})
    .exec()
    .then(item => item.title))
  const group = await Promise.all(procedure)

  ctx.body = {
    user,
    solved,
    unsolved,
    group
  }
}

// 注册
const create = async (ctx) => {
  if (!ctx.request.body.pwd || ctx.request.body.pwd.length <= 5) {
    ctx.throw(400, 'the length of the password must be greater than 5')
  }
  const user = new User({
    uid: ctx.request.body.uid,
    nick: ctx.request.body.nick,
    pwd: generatePwd(ctx.request.body.pwd)
  })
  // 将objectid转换为用户创建时间(可以不用)
  // user.create = moment(objectIdToTimestamp(user._id)).format('YYYY-MM-DD HH:mm:ss')
  const doc = await User.findOne({ uid: user.uid }).exec()
  if (doc) {
    ctx.throw(400, '用户名已被占用!')
  }
  try {
    await user.save()
  } catch (err) {
    ctx.throw(400, err.message)
  }

  ctx.body = {}
}

// 修改用户信息
const update = async (ctx) => {
  if (!isAdmin(ctx.session.profile) && ctx.session.profile.uid !== ctx.state.user.uid) {
    ctx.throw(400, 'You do not have permission to change this user information!')
  }
  if (ctx.state.user.uid === 'admin' && !isRoot(ctx.session.profile)) {
    ctx.throw(400, "You do not have permission to change Root's information!")
  }
  const opt = ctx.request.body
  const user = ctx.state.user
  const fileds = ['nick', 'motto', 'school', 'mail']
  fileds.forEach((filed) => {
    if (!isUndefined(opt[filed])) {
      user[filed] = opt[filed]
    }
  })
  if (!isUndefined(opt.privilege)) {
    user.privilege = parseInt(opt.privilege)
  }
  if (opt.newPwd) {
    user.pwd = generatePwd(opt.newPwd)
  }

  try {
    await user.save()
    logger.info(`One user is updated" ${user.uid}`)
  } catch (e) {
    ctx.throw(400, e.message)
  }

  ctx.body = {
    success: true,
    uid: user.uid
  }
}

module.exports = {
  preload,
  find,
  findOne,
  create,
  update
}
